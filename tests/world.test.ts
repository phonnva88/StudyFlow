import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { TokenVerifier } from 'livekit-server-sdk';
import { POST } from '../src/app/api/world/token/route';
import { AVATAR_COLORS, canStand, DESKS, mapDesks, publicWorldRoom, readMotion, SPAWN, WORLD_ROOM } from '../src/lib/world';
import type { DiscoveryRoom } from '../src/lib/discovery-types';

test('world collisions, untrusted motion, public metadata and stable eight-desk assignment', () => {
  assert.ok(canStand(SPAWN.x, SPAWN.y));
  assert.ok(!canStand(0, 0)); assert.ok(!canStand(NaN, 200));
  for (const desk of DESKS) assert.ok(!canStand(desk.x, desk.y));
  const motion = {...SPAWN, direction: 'up', animation: 'walking', seq: 1};
  assert.deepEqual(readMotion({...motion, playerId: 'forged'}), motion);
  for (const bad of [{...motion, x: Infinity}, {...motion, seq: -1}, {...motion, direction: 'bad'}, {...motion, x: DESKS[0].x, y: DESKS[0].y}]) assert.equal(readMotion(bad), null);
  const room = (i: number): DiscoveryRoom => ({id: i.toString(16).padStart(32, '0'), title: `Room ${i}`, hostName: 'Ada', visibility: 'PUBLIC', status: i === 0 ? 'FULL' : i === 1 ? 'ACTIVE' : 'EMPTY', participantCount: i === 0 ? 6 : i === 1 ? 2 : 0, maxParticipants: 6, createdAt: i, expiresAt: Date.now() + 60000});
  const rooms = Array.from({length: 10}, (_, i) => room(i));
  assert.ok(publicWorldRoom(rooms[0]));
  assert.ok(!publicWorldRoom({...rooms[0], visibility: 'PRIVATE'}));
  assert.ok(!publicWorldRoom({...rooms[0], expiresAt: 1}));
  assert.ok(!publicWorldRoom({...rooms[0], id: '../../secret'}));
  const slots = mapDesks([], rooms);
  assert.equal(slots.length, 8); assert.equal(slots[0]?.id, rooms[1].id);
  assert.ok(slots.every(r => r?.status !== 'FULL'));
  const refreshed = mapDesks(slots, rooms.toReversed().map(r => ({...r, status: 'FULL' as const, participantCount: 6})));
  assert.deepEqual(refreshed.map(r => r?.id), slots.map(r => r?.id));
  assert.deepEqual(mapDesks(slots, rooms.filter(r => r.id !== slots[2]?.id)).slice(0, 2), slots.slice(0, 2));
});

test('world admission issues data-only unique identities with enforced cap, validation, CSRF and rate limits', async t => {
  Object.assign(process.env, {LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters', UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only'});
  let connected = 0, requests = 1, capacity = 20;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    if (String(url).includes('livekit.cloud')) {
      if (String(url).endsWith('/CreateRoom')) {
        assert.equal(input.name, WORLD_ROOM); assert.equal(input.maxParticipants, 20);
        return Response.json({name: WORLD_ROOM, sid: 'RM_world', maxParticipants: capacity});
      }
      assert.equal(input.room, WORLD_ROOM);
      return Response.json({participants: Array.from({length: connected}, (_, i) => ({identity: `world-${i}`}))});
    }
    const result = {result: requests};
    return Response.json(Array.isArray(input[0]) ? input.map(() => result) : result);
  });
  const request = (input: unknown = {nickname: 'Ada', avatarColor: AVATAR_COLORS[0]}, origin = 'http://localhost') => new NextRequest('http://localhost/api/world/token', {method: 'POST', headers: {origin, 'Content-Type': 'application/json'}, body: JSON.stringify(input)});
  const first = await POST(request()); assert.equal(first.status, 200);
  const data = await first.json();
  const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!).verify(data.token);
  assert.equal(claims.video?.room, WORLD_ROOM); assert.equal(claims.video?.canPublish, false); assert.equal(claims.video?.canSubscribe, false); assert.equal(claims.video?.canPublishData, true); assert.equal(claims.video?.canUpdateOwnMetadata, false);
  assert.ok(!claims.video?.roomAdmin); assert.match(claims.sub!, /^world-/);
  assert.equal(claims.roomConfig?.maxParticipants, 20);
  assert.equal(JSON.parse(claims.metadata!).worldAvatar, AVATAR_COLORS[0]);
  const second = await (await POST(request())).json();
  assert.notEqual(second.token, data.token);
  assert.equal((await POST(request({nickname: '', avatarColor: AVATAR_COLORS[0]}))).status, 400);
  assert.equal((await POST(request({nickname: 'Ada', avatarColor: 'javascript:bad'}))).status, 400);
  assert.equal((await POST(request(undefined, 'https://attacker.test'))).status, 403);
  connected = 20; assert.equal((await POST(request())).status, 409);
  connected = 0; capacity = 0; assert.equal((await POST(request())).status, 503);
  capacity = 20; requests = 11; assert.equal((await POST(request())).status, 429);
});
