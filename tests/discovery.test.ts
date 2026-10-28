import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/rooms/route';
import { visibility } from '../src/lib/validation';

test('discovery scans all metadata, uses LiveKit presence, hides private/ended/expired records and credentials', async t => {
  Object.assign(process.env, {
    LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key',
    LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only',
  });
  const record = (n: number, extra = {}) => ({ id: n.toString(16).padStart(32, '0'), title: `Room ${n}`, hostName: 'Ada', hostHash: 'never-public', visibility: 'PUBLIC', state: 'CREATED', createdAt: n, expiresAt: Date.now() + 3600000, ...extra });
  const rooms = [record(1), record(2), record(3), record(4, { visibility: 'PRIVATE' }), record(5, { visibility: undefined }), record(6, { state: 'ENDED' }), record(7, { expiresAt: 1 }), record(8)];
  let scans = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const data = JSON.parse(String(init?.body));
    if (String(url).includes('livekit.cloud')) {
      assert.ok(String(url).endsWith('/ListRooms'));
      assert.equal(data.names.length, 4);
      rooms[7].state = 'ENDED'; // Ended during the presence lookup must be excluded.
      return Response.json({ rooms: [
        { name: `studyflow-${rooms[0].id}`, numParticipants: 3 },
        { name: `studyflow-${rooms[1].id}`, numParticipants: 6 },
        // Room 3 is still valid even when its LiveKit media room is absent.
      ] });
    }
    const command = (args: unknown[]) => {
      switch (String(args[0]).toLowerCase()) {
        case 'eval': return { result: 1 };
        case 'scan': {
          scans++;
          const keys = rooms.map(r => `studyflow:room:${r.id}`);
          return { result: String(args[1]) === '0' ? ['1', keys.slice(0, 4)] : ['0', [keys[0], ...keys.slice(4)]] };
        }
        case 'mget': return { result: args.slice(1).map(key => JSON.stringify(rooms.find(r => key === `studyflow:room:${r.id}`))) };
        default: throw new Error(`Unexpected command ${args[0]}`);
      }
    };
    return Response.json(Array.isArray(data[0]) ? data.map(command) : command(data));
  });
  const response = await GET(new NextRequest('http://localhost/api/rooms'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(scans, 4);
  assert.deepEqual(result.rooms.map((r: {status: string}) => r.status), ['EMPTY', 'FULL', 'ACTIVE']);
  assert.deepEqual(result.rooms.map((r: {participantCount: number}) => r.participantCount), [0, 6, 3]);
  assert.equal(result.rooms.length, 3);
  assert.ok(!JSON.stringify(result).includes('hostHash'));
  assert.ok(!JSON.stringify(result).includes('never-public'));
  assert.ok(result.rooms.every((r: {maxParticipants: number}) => r.maxParticipants === 6));
});

test('visibility is explicit and older clients remain private', () => {
  assert.equal(visibility(undefined), 'PRIVATE');
  assert.equal(visibility('PUBLIC'), 'PUBLIC');
  assert.equal(visibility('PRIVATE'), 'PRIVATE');
  for (const value of ['public', null, true, {}, '']) assert.throws(() => visibility(value));
});
