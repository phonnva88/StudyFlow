import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { searchInput, searchMusic, youtubeDetails } from '../src/lib/music-search';
import { musicEndpoint, musicSearchEndpoint } from '../src/lib/music-api';
import { musicSession } from '../src/lib/music-session';

test('search rejects invalid providers and queries and reports missing server configuration', async () => {
  for (const [provider, query] of [['other', 'song'], ['youtube', 'a'], ['spotify', '\n'], ['youtube', 'x'.repeat(101)]]) {
    assert.throws(() => searchInput(provider, query));
  }
  assert.deepEqual(searchInput('spotify', '  song  '), {provider: 'spotify', query: 'song'});
  delete process.env.YOUTUBE_API_KEY; delete process.env.SPOTIFY_CLIENT_ID; delete process.env.SPOTIFY_CLIENT_SECRET;
  await assert.rejects(searchMusic('youtube', 'song'), /YOUTUBE_API_KEY/);
  await assert.rejects(searchMusic('spotify', 'song'), /SPOTIFY_CLIENT_ID/);
});

test('official search maps trusted metadata and canonical URLs, handles empty results and hides upstream errors', async t => {
  process.env.YOUTUBE_API_KEY = 'test-youtube-key';
  process.env.SPOTIFY_CLIENT_ID = 'test-client'; process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  let tokenRequests = 0, mode = 'normal';
  const video = 'aB1_cD2-eF3', spotifyId = '1234567890123456789012';
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(init?.cache, 'no-store');
    if (mode === 'failure') return Response.json({error: 'secret-provider-internals'}, {status: 403});
    if (mode === 'network') throw new Error('secret-provider-internals');
    if (url.hostname === 'accounts.spotify.com') {
      tokenRequests++; assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /);
      return Response.json({access_token: 'server-only-token', expires_in: 3600});
    }
    if (url.hostname === 'api.spotify.com') {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
      return Response.json({tracks: {items: mode === 'empty' ? [] : [{id: spotifyId, name: 'Quiet Song', artists: [{name: 'Artist'}], album: {images: [{url: 'https://i.scdn.co/image/abc123'}]}}]}});
    }
    assert.equal(url.hostname, 'www.googleapis.com');
    assert.equal((init?.headers as Record<string, string>)['X-Goog-Api-Key'], 'test-youtube-key');
    assert.equal(url.searchParams.has('key'), false);
    return Response.json({items: mode === 'empty' ? [] : [{id: url.pathname.endsWith('/videos') ? video : {videoId: video}, snippet: {title: 'Study Song', channelTitle: 'Artist'}}]});
  });
  const youtube = await searchMusic('youtube', 'study');
  assert.equal(youtube[0].title, 'Study Song');
  assert.equal(youtube[0].thumbnail, `https://i.ytimg.com/vi/${video}/mqdefault.jpg`);
  const metadata = await youtubeDetails(video);
  assert.equal(metadata.externalId, video); assert.equal(metadata.title, 'Study Song'); assert.equal(metadata.durationSeconds, 0);
  const spotify = await searchMusic('spotify', 'study');
  assert.equal(spotify[0].url, `https://open.spotify.com/track/${spotifyId}`);
  assert.equal(spotify[0].thumbnail, 'https://i.scdn.co/image/abc123');
  await searchMusic('spotify', 'another song'); assert.equal(tokenRequests, 1);
  assert.equal(JSON.stringify(spotify).includes('server-only-token'), false);
  mode = 'empty'; assert.deepEqual(await searchMusic('youtube', 'unknown'), []);
  assert.deepEqual(await searchMusic('spotify', 'unknown'), []);
  mode = 'failure'; await assert.rejects(searchMusic('youtube', 'study'), error => error instanceof Error && !error.message.includes('secret-provider'));
  mode = 'network'; await assert.rejects(searchMusic('youtube', 'study'), /could not be reached/);
});

test('search requires room membership, enforces limits, and queues YouTube metadata from the server', async t => {
  Object.assign(process.env, {LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters', UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only', YOUTUBE_API_KEY: 'test-key'});
  const id = 'a'.repeat(32), identity = 'participant-11111111-1111-4111-8111-111111111111', video = 'aB1_cD2-eF3';
  const session = musicSession(id, identity, Date.now() + 60000);
  let connected = true, limited = false, requested: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('googleapis.com')) return Response.json({items: [{id: video, snippet: {title: 'Verified title', channelTitle: 'Verified artist'}}]});
    if (String(url).includes('livekit.cloud')) return connected ? Response.json({identity, name: 'Listener'}) : Response.json({}, {status: 404});
    const data = JSON.parse(String(init?.body));
    const command = (args: unknown[]) => {
      if (String(args[0]).toLowerCase() === 'get') return {result: JSON.stringify({id, state: 'LIVE', expiresAt: Date.now() + 60000})};
      if (String(args[1]).includes('INCR')) return {result: limited ? 1000 : 1};
      requested = JSON.parse(String(args.at(-1)));
      return {result: JSON.stringify({current: null, queue: [], version: 1})};
    };
    return Response.json(Array.isArray(data[0]) ? data.map(command) : command(data));
  });
  const request = () => new NextRequest(`http://localhost/api/rooms/${id}/music/search?provider=youtube&q=study`, {headers: {Authorization: `Bearer ${session}`}});
  assert.equal((await musicSearchEndpoint(new NextRequest(`http://localhost/api/rooms/${id}/music/search?provider=youtube&q=study`), id)).status, 403);
  connected = false; assert.equal((await musicSearchEndpoint(request(), id)).status, 403);
  connected = true; limited = true; assert.equal((await musicSearchEndpoint(request(), id)).status, 429);
  limited = false; assert.equal((await musicSearchEndpoint(request(), id)).status, 200);
  const add = new NextRequest(`http://localhost/api/rooms/${id}/music/requests`, {method: 'POST', headers: {origin: 'http://localhost', 'Content-Type': 'application/json', Authorization: `Bearer ${session}`}, body: JSON.stringify({url: `https://youtu.be/${video}`, title: 'Forged title', thumbnail: 'https://evil.test/image'})});
  assert.equal((await musicEndpoint(add, id, 'request')).status, 200);
  const track = requested.track as {title: string; thumbnail: string};
  assert.equal(track.title, 'Verified title'); assert.equal(track.thumbnail.includes('evil.test'), false);
});
