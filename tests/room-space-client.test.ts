import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {RoomSpaceClient} from '../src/lib/room-space-client';
import {ROOM_SPACE_SEATS, type RoomSpaceSnapshot, type RoomSpacePlayer} from '../src/lib/room-space';

const actor = 'participant-11111111-1111-4111-8111-111111111111';
const other = 'participant-22222222-2222-4222-8222-222222222222';
const room = 'a'.repeat(32);
const flush = () => setImmediate();
function player(extra: Partial<RoomSpacePlayer> = {}): RoomSpacePlayer {
  return {identity: actor, name: 'Ada', ...ROOM_SPACE_SEATS[0], seat: 0, updatedAt: 1000, ...extra};
}
function snapshot(version: number, own: Partial<RoomSpacePlayer> = {}): RoomSpaceSnapshot {
  return {players: [player(own)], serverNow: 1000 + version, version};
}
function harness(t: TestContext) {
  t.mock.timers.enable({apis: ['setInterval']});
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const calls: {url: string; init?: RequestInit; resolve: (response: Response) => void; reject: (reason: Error) => void}[] = [];
  t.mock.method(globalThis, 'fetch', (url: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    calls.push({url: String(url), init, resolve, reject});
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
  }));
  const client = new RoomSpaceClient();
  t.after(() => client.stop());
  const snapshots: RoomSpaceSnapshot[] = [], errors: string[] = [];
  const start = (identity = actor, id = room) => client.start(id, identity, 'signed-session', s => snapshots.push(s), e => errors.push(e));
  const respond = async (index: number, value: unknown, status = 200) => { calls[index].resolve(Response.json(value, {status})); await flush(); };
  const advance = async (ms: number) => { now += ms; t.mock.timers.tick(ms); await flush(); };
  return {client, calls, snapshots, errors, start, respond, advance};
}

test('room controller waits for own seat, serializes interactions and preserves accepted local prediction', async t => {
  const h = harness(t);
  h.start(); h.client.setEnabled(true);
  assert.equal(h.client.enabled, false);
  const first = h.client.act({action: 'stand'});
  const second = h.client.act({action: 'sit', seat: 0});
  assert.equal(h.calls.length, 1); // Both commands wait for authoritative admission.
  await h.respond(0, snapshot(1));
  assert.equal(h.client.enabled, true);
  assert.equal(h.client.local.x, -4); assert.equal(h.client.local.seat, 0);
  assert.equal(h.calls.length, 2);
  assert.equal(JSON.parse(String(h.calls[1].init?.body)).action, 'stand');
  await h.respond(1, snapshot(2, {seat: null, z: -0.55}));
  assert.equal(h.calls.length, 3);
  assert.equal(JSON.parse(String(h.calls[2].init?.body)).action, 'sit');
  await h.respond(2, snapshot(3)); await Promise.all([first, second]);
  const stand = h.client.act({action: 'stand'});
  await h.respond(3, snapshot(4, {seat: null, z: -0.55})); await stand;
  h.client.local.x = -3.6;
  await h.advance(220);
  assert.equal(h.calls.length, 5);
  assert.deepEqual(JSON.parse(String(h.calls[4].init?.body)), {action: 'move', x: -3.6, z: -0.55, yaw: 0});
  // Keep walking during a slow response: accepting an older sent pose must not rewind the camera.
  h.client.local.x = -2;
  await h.respond(4, snapshot(5, {seat: null, x: -3.6, z: -0.55}));
  assert.equal(h.client.local.x, -2);
  await h.advance(220);
  assert.equal(JSON.parse(String(h.calls[5].init?.body)).x, -2);
  await h.respond(5, {error: 'Movement was too fast.'}, 409);
  assert.equal(h.client.local.x, -3.6);
  assert.equal(h.client.enabled, false);
  assert.equal(h.errors.at(-1), 'Movement was too fast.');
  await h.advance(1100);
  assert.equal(h.calls[6].init?.method, 'GET');
  await h.respond(6, snapshot(6, {seat: null, x: -3.6, z: -0.55}));
  assert.equal(h.client.enabled, true);
  assert.equal(h.errors.at(-1), '');
});

test('room controller ignores older state and rejects malformed or missing own snapshots', async t => {
  const h = harness(t);
  h.start(); h.client.setEnabled(true);
  await h.respond(0, snapshot(10));
  let read = h.client.read();
  await h.respond(1, snapshot(9, {x: 4, seat: 2})); await read;
  assert.equal(h.client.snapshot.version, 10); assert.equal(h.client.local.x, -4);
  read = h.client.read();
  await h.respond(2, {...snapshot(10), serverNow: 1009}); await read;
  assert.equal(h.snapshots.length, 1);
  read = h.client.read();
  await h.respond(3, {...snapshot(11), players: [{...player(), x: 'NaN'}]}); await read;
  assert.equal(h.client.snapshot.version, 10); assert.equal(h.client.enabled, false);
  assert.equal(h.errors.at(-1), 'Room interaction returned invalid data.');
  read = h.client.read();
  await h.respond(4, {players: [], version: 12, serverNow: 1012}); await read;
  assert.equal(h.client.enabled, false);
  assert.match(h.errors.at(-1)!, /Rejoin/);
  read = h.client.read();
  await h.respond(5, snapshot(13, {x: 4, seat: 2})); await read;
  assert.equal(h.client.local.x, 4); assert.equal(h.client.enabled, true);
});

test('room controller backs off failures and aborts old lifecycle work without leaking actions into another room', async t => {
  const h = harness(t);
  h.start(); h.client.setEnabled(true);
  h.calls[0].reject(new Error('Network unavailable.')); await flush();
  assert.equal(h.errors.at(-1), 'Network unavailable.');
  await h.advance(500); assert.equal(h.calls.length, 1);
  await h.advance(600); assert.equal(h.calls.length, 2);
  h.calls[1].reject(new Error('Still unavailable.')); await flush();
  await h.advance(1900); assert.equal(h.calls.length, 2);
  await h.advance(200); assert.equal(h.calls.length, 3);
  await h.respond(2, snapshot(1));
  assert.equal(h.client.enabled, true);
  const oldRead = h.client.read();
  const oldAction = h.client.act({action: 'stand'});
  h.start(other, 'b'.repeat(32));
  assert.equal(h.calls[3].init?.signal?.aborted, true);
  assert.equal(h.client.enabled, false);
  await Promise.all([oldRead, oldAction]);
  assert.equal(h.calls.length, 5); // Restart GET only; queued old stand must be discarded.
  assert.equal(h.calls[4].url, `/api/rooms/${'b'.repeat(32)}/space`);
  await h.respond(4, {players: [player({identity: other, x: 0, seat: 1})], version: 1, serverNow: 1001});
  assert.equal(h.client.identity, other); assert.equal(h.client.local.x, 0);
  h.client.stop();
  const count = h.calls.length;
  await h.advance(10000);
  assert.equal(h.calls.length, count);
});
