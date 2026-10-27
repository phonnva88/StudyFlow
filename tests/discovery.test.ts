import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as listRooms, POST as create } from '../src/app/api/rooms/route';
import { GET as getRoom } from '../src/app/api/rooms/[roomId]/route';
import { POST as token } from '../src/app/api/rooms/[roomId]/token/route';
import { hashCredential } from '../src/lib/auth';
import type { StudyRoom } from '../src/lib/room-store';

function configure() {
  Object.assign(process.env, {
    LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key',
    LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only',
  });
}
function record(char: string, overrides: Partial<StudyRoom> = {}): StudyRoom {
  return {
    id: char.repeat(32), title: `Study ${char}`, hostName: 'Ada',
    hostHash: hashCredential('c'.repeat(64)), state: 'LIVE', visibility: 'PUBLIC',
    createdAt: Date.now() - 10000, expiresAt: Date.now() + 3600000, ...overrides,
  };
}

test('discovery scans all pages, deduplicates records, includes empty media-less rooms, excludes private/legacy/ended/expired/deleted rooms, and uses provider counts', async t => {
  configure();
  const records = [record('a'), record('b', { state: 'CREATED' }), record('c'),
    record('d', { visibility: 'PRIVATE' }), record('e', { visibility: undefined }),
    record('f', { state: 'ENDED' }), record('1', { expiresAt: Date.now() - 1 })];
  const scanned: string[] = [];
  const keys = records.map(room => `studyflow:room:${room.id}`);
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    if (String(url).includes('test.livekit.cloud')) {
      assert.ok(String(url).endsWith('/ListRooms'));
      assert.deepEqual(new Set(payload.names), new Set(records.slice(0, 3).map(room => `studyflow-${room.id}`)));
      // a: two participants regardless of their tracks; b has no LiveKit room.
      return Response.json({ rooms: [
        { name: `studyflow-${records[0].id}`, numParticipants: 2, numPublishers: 0 },
        { name: `studyflow-${records[2].id}`, numParticipants: 6, numPublishers: 1 },
      ] });
    }
    function command(args: unknown[]) {
      switch (String(args[0]).toLowerCase()) {
        case 'eval': return { result: 1 };
        case 'scan': {
          scanned.push(String(args[1]));
          assert.ok(args.includes('studyflow:room:*'));
          return { result: String(args[1]) === '0' ? ['42', keys.slice(0, 4)] : ['0', [...keys.slice(3), 'studyflow:room:deleted']] };
        }
        case 'mget': return { result: args.slice(1).map(key => {
          const room = records.find(room => `studyflow:room:${room.id}` === key);
          return room ? JSON.stringify(room) : null;
        }) };
        default: throw new Error(`Unexpected command ${args[0]}`);
      }
    }
    return Response.json(Array.isArray(payload[0]) ? payload.map(command) : command(payload));
  });
  const response = await listRooms(new NextRequest('http://localhost/api/rooms'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.deepEqual(scanned, ['0', '42']);
  assert.equal(data.rooms.length, 3);
  for (const [i, status, count] of [[0, 'ACTIVE', 2], [1, 'EMPTY', 0], [2, 'FULL', 6]] as const) {
    const room = data.rooms.find((room: { id: string }) => room.id === records[i].id);
    assert.equal(room.status, status);
    assert.equal(room.participantCount, count);
    assert.equal(room.maxParticipants, 6);
    assert.equal(room.createdAt, records[i].createdAt);
    assert.deepEqual(Object.keys(room).sort(), ['id', 'title', 'hostName', 'visibility', 'status', 'participantCount', 'maxParticipants', 'createdAt', 'expiresAt'].sort());
  }
  assert.ok(!JSON.stringify(data).includes(records[0].hostHash));
});

test('presence outages return an uncached error instead of falsely reporting empty rooms; discovery is rate limited', async t => {
  configure();
  let throttled = false;
  const room = record('a');
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('test.livekit.cloud')) return Response.json({ code: 'unavailable', msg: 'provider-private-detail' }, { status: 503 });
    const payload = JSON.parse(String(init?.body));
    function command(args: unknown[]) {
      const cmd = String(args[0]).toLowerCase();
      if (cmd === 'eval') return { result: throttled ? 31 : 1 };
      if (cmd === 'scan') return { result: ['0', [`studyflow:room:${room.id}`]] };
      if (cmd === 'mget') return { result: [JSON.stringify(room)] };
      throw new Error('Unexpected command');
    }
    return Response.json(Array.isArray(payload[0]) ? payload.map(command) : command(payload));
  });
  const response = await listRooms(new NextRequest('http://localhost/api/rooms'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(await response.json()).includes('provider-private-detail'));
  throttled = true;
  assert.equal((await listRooms(new NextRequest('http://localhost/api/rooms'))).status, 429);
});

test('invite-only creation stays private and rejects invalid visibility; legacy invitation IDs continue authorizing joins', async t => {
  configure();
  const room = record('a', { visibility: undefined });
  let saved: StudyRoom | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    if (String(url).includes('test.livekit.cloud')) {
      if (String(url).endsWith('/CreateRoom')) return Response.json({ name: payload.name, maxParticipants: 6 });
      if (String(url).endsWith('/ListRooms')) return Response.json({ rooms: [] });
      if (String(url).endsWith('/ListParticipants')) return Response.json({ participants: Array.from({ length: 6 }, () => ({ identity: 'one' })) });
      throw new Error('Unexpected provider call');
    }
    function command(args: unknown[]) {
      if (String(args[0]).toLowerCase() === 'eval') return { result: 1 };
      if (String(args[0]).toLowerCase() === 'get') return { result: JSON.stringify(room) };
      if (String(args[0]).toLowerCase() === 'set') { saved = JSON.parse(String(args[2])); return { result: 'OK' }; }
      throw new Error('Unexpected command');
    }
    return Response.json(Array.isArray(payload[0]) ? payload.map(command) : command(payload));
  });
  const request = (url: string, data: unknown) => new NextRequest(`http://localhost${url}`, {
    method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(data),
  });
  assert.equal((await create(request('/api/rooms', { nickname: 'Ada', title: 'Private', visibility: 'PRIVATE' }))).status, 201);
  assert.equal(saved?.visibility, 'PRIVATE');
  assert.equal((await create(request('/api/rooms', { nickname: 'Ada', title: 'Bad', visibility: 'hidden' }))).status, 400);
  const context = { params: Promise.resolve({ roomId: room.id }) };
  const metadata = await (await getRoom(new NextRequest(`http://localhost/api/rooms/${room.id}`), context)).json();
  assert.equal(metadata.visibility, 'PRIVATE');
  assert.equal(metadata.status, 'EMPTY');
  assert.equal((await token(request(`/api/rooms/${room.id}/token`, { nickname: 'Invited' }), context)).status, 200);
  assert.equal((await token(request('/api/rooms/invalid/token', { nickname: 'Unknown' }), { params: Promise.resolve({ roomId: 'invalid' }) })).status, 404);
});
