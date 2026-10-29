import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { musicSession, verifyMusicSession } from '../src/lib/music-session';
import { musicEndpoint } from '../src/lib/music-api';
import { musicScript } from '../src/lib/music-store';
import { newHostCredential, hashCredential, hostCookie } from '../src/lib/auth';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { musicPosition } from '../src/lib/music-timeline';
import type { MusicState } from '../src/lib/music-types';
import { youtubeId, spotifyEmbed } from '../src/lib/external-music';
import { requestedTrack } from '../src/lib/music-store';

function setup() {
  Object.assign(process.env, { LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters', UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only' });
}
const id = 'a'.repeat(32), identity = 'participant-11111111-1111-4111-8111-111111111111';
test('external providers accept only canonical HTTPS provider IDs and never arbitrary audio', () => {
  const video = 'aB1_cD2-eF3';
  assert.equal(youtubeId(`https://youtu.be/${video}?t=10`), video);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${video}`), video);
  assert.equal(youtubeId(`https://music.youtube.com/watch?v=${video}`), video);
  for (const value of ['javascript:alert(1)', `https://youtube.com.evil.test/watch?v=${video}`, `https://user@youtube.com/watch?v=${video}`, 'https://youtu.be/invalid', 'http://youtube.com/watch?v=aB1_cD2-eF3']) assert.equal(youtubeId(value), null);
  assert.equal(spotifyEmbed('https://open.spotify.com/track/1234567890123456789012?si=abc'), 'https://open.spotify.com/embed/track/1234567890123456789012');
  assert.equal(spotifyEmbed('https://evil.test/track/1234567890123456789012'), null);
  const item = requestedTrack(undefined, 'Ada', `https://youtu.be/${video}`);
  assert.equal(item.track?.provider, 'youtube');
  assert.equal(item.requestedBy, 'Ada');
  assert.equal(item.durationSeconds, 0); // Never invent a video duration.
  assert.throws(() => requestedTrack(undefined, 'Ada', 'https://example.com/audio.mp3'));
});
test('late listeners calculate the shared position, include latency and freeze when paused', () => {
  const state: MusicState = {current: {id: 'a', trackId: 'a', requestedBy: 'Ada', requestedAt: 0, durationSeconds: 45}, queue: [], status: 'PLAYING', startedAt: 100000, serverNow: 110000, positionSeconds: 5, version: 1};
  assert.equal(musicPosition(state, 200), 15.2);
  // A later snapshot describing the same timeline gives the same position.
  assert.equal(musicPosition({...state, serverNow: 110100}, 100), 15.2);
  assert.equal(musicPosition({...state, status: 'PAUSED', startedAt: null}, 9000), 5);
  assert.equal(musicPosition(state, 900000), 45);
});
test('music credentials are signed, room-bound and expire', () => {
  setup();
  const session = musicSession(id, identity, Date.now() + 60000);
  assert.equal(verifyMusicSession(session, id), identity);
  assert.throws(() => verifyMusicSession(session, 'b'.repeat(32)));
  assert.throws(() => verifyMusicSession(session + 'x', id));
  assert.throws(() => verifyMusicSession(musicSession(id, identity, 1), id));
});

test('music APIs require connected identity, use trusted attribution, and reserve playback administration for creator', async t => {
  setup();
  const credential = newHostCredential();
  const session = musicSession(id, identity, Date.now() + 60000);
  let connected = true;
  let requested: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const data = JSON.parse(String(init?.body));
    if (String(url).includes('livekit.cloud')) {
      if (String(url).endsWith('/GetParticipant')) return connected ? Response.json({ identity, name: 'Verified Nickname' }) : new Response('{}', {status: 404});
      return Response.json({});
    }
    const command = (args: unknown[]) => {
      if (String(args[0]).toLowerCase() === 'get') return {result: JSON.stringify({id, title: 'Study', hostHash: hashCredential(credential), state: 'LIVE', expiresAt: Date.now() + 60000})};
      if (String(args[1]).includes('INCR')) return {result: 1};
      requested = JSON.parse(String(args.at(-1)));
      return {result: JSON.stringify({current: null, queue: [], status: 'IDLE', positionSeconds: 0, startedAt: null, version: 1, serverNow: Date.now()})};
    };
    return Response.json(Array.isArray(data[0]) ? data.map(command) : command(data));
  });
  const request = (host = false, input: unknown = {expectedVersion: 0}) => new NextRequest(`http://localhost/api/rooms/${id}/music/play`, {method: 'POST', headers: {origin: 'http://localhost', 'Content-Type': 'application/json', Authorization: `Bearer ${session}`, ...(host ? {cookie: `${hostCookie(id)}=${credential}`} : {})}, body: JSON.stringify(input)});
  assert.equal((await musicEndpoint(request(), id, 'play')).status, 403);
  assert.equal((await musicEndpoint(request(true), id, 'play')).status, 200);
  assert.equal((await musicEndpoint(request(false, {trackId: 'quiet-orbit', requestedBy: 'Forged'}), id, 'request')).status, 200);
  assert.equal(requested.requestedBy, 'Verified Nickname');
  assert.equal((await musicEndpoint(request(false, {trackId: 'https://unauthorized.example/song.mp3'}), id, 'request')).status, 400);
  connected = false;
  assert.equal((await musicEndpoint(request(true), id, 'play')).status, 403);
});

test('real Redis Lua serializes requests, advances once, pauses inactivity, isolates rooms and expires state', {skip: process.env.STUDYFLOW_REDIS_TEST !== '1'}, async () => {
  const exec = promisify(execFile);
  const command = async (...args: string[]) => JSON.parse((await exec('docker', ['--host=unix:///var/run/docker.sock', 'exec', 'studyflow-music-redis-test', 'redis-cli', '--json', ...args])).stdout);
  const room = 'studyflow:room:music-test', music = 'studyflow:music:music-test';
  await command('SET', room, JSON.stringify({state: 'LIVE', expiresAt: Date.now() + 60000}));
  await command('DEL', music);
  const update = async (op = 'snapshot', data = {}) => JSON.parse(await command('EVAL', musicScript, '2', room, music, op, JSON.stringify(data)));
  const item = (n: number) => ({id: `item-${n}`, trackId: `track-${n}`, durationSeconds: 45, requestedBy: 'Ada', requestedAt: Date.now()});
  await Promise.all([update('request', item(1)), update('request', item(2))]);
  let s = await update();
  assert.equal(s.queue.length, 2);
  const first = s.queue[0].id, second = s.queue[1].id;
  s = await update('play', {expectedVersion: s.version});
  assert.equal(s.current.id, first);
  assert.equal((await update('skip', {expectedVersion: s.version - 1})).code, 409);
  assert.equal((await update('request', {...s.current})).code, 409);
  // Simulate a completion without sleeping: move the authoritative start time.
  s.startedAt -= 46000; s.lastSeen = Date.now();
  await command('SET', music, JSON.stringify(s));
  await Promise.all([update(), update()]);
  s = await update();
  assert.equal(s.current.id, second); // Both pollers must not skip two songs.
  assert.equal(s.status, 'PLAYING');
  s.lastSeen = Date.now() - 20000;
  s.startedAt = s.lastSeen - 1000;
  await command('SET', music, JSON.stringify(s));
  s = await update();
  assert.equal(s.status, 'PAUSED');
  assert.ok(s.positionSeconds < 3);
  assert.ok(await command('PTTL', music) > 0);
  assert.equal(await command('GET', 'studyflow:music:another-room'), null);
  await command('SET', room, JSON.stringify({state: 'ENDED', expiresAt: Date.now() + 60000}));
  assert.equal((await update()).code, 410);
  assert.equal(await command('GET', music), null);
  await command('DEL', room);
});
