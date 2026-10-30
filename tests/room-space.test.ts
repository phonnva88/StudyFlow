import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest } from 'next/server';
import { roomSpaceEndpoint } from '../src/lib/room-space-api';
import { musicSession } from '../src/lib/music-session';
import { roomSpaceScript, updateRoomSpace } from '../src/lib/room-space-store';
import { ROOM_SPACE_BOUNDS, ROOM_SPACE_OBSTACLES, ROOM_SPACE_SEATS, ROOM_SPACE_COLLISION_EPSILON, roomSpaceCanStand, validRoomSpaceSnapshot } from '../src/lib/room-space';

const id = 'a'.repeat(32);
const actor = 'participant-11111111-1111-4111-8111-111111111111';
const target = 'participant-22222222-2222-4222-8222-222222222222';
const config = () => Object.assign(process.env, {LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters', UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only'});

test('room geometry keeps seats accessible while rejecting wall/furniture and invalid snapshot data', () => {
  assert.equal(ROOM_SPACE_SEATS.length, 6);
  for (const seat of ROOM_SPACE_SEATS) {
    assert.ok(roomSpaceCanStand(seat.x, seat.z));
    assert.ok(roomSpaceCanStand(seat.x, seat.z + 0.85));
    assert.ok(!roomSpaceCanStand(seat.x, seat.z - 0.9));
  }
  assert.ok(!roomSpaceCanStand(Infinity, 0)); assert.ok(!roomSpaceCanStand(8, 0));
  const snapshot = {players: [{identity: actor, name: 'Ada', ...ROOM_SPACE_SEATS[0], seat: 0, updatedAt: 1}], serverNow: 1, version: 1};
  assert.ok(validRoomSpaceSnapshot(snapshot));
  assert.ok(!validRoomSpaceSnapshot({...snapshot, players: [{...snapshot.players[0], x: NaN}]}));
  assert.ok(!validRoomSpaceSnapshot({...snapshot, players: [null]}));
});

test('serialized collision boundaries remain valid without allowing penetration into furniture', () => {
  // Lua accepts -5.380000000000001, then cjson encodes it as -5.38.
  const rounded = JSON.parse('{"x":-5.38,"z":-2.3}');
  assert.ok(roomSpaceCanStand(rounded.x, rounded.z));
  assert.ok(roomSpaceCanStand(-5.380000000000001, -2.3));
  assert.ok(!roomSpaceCanStand(-5.38 + ROOM_SPACE_COLLISION_EPSILON * 10, -2.3));
  assert.ok(!roomSpaceCanStand(ROOM_SPACE_BOUNDS.maxX - 0.28 + ROOM_SPACE_COLLISION_EPSILON * 10, 4));
  assert.ok(validRoomSpaceSnapshot({players: [{identity: target, name: 'Bob', ...rounded, yaw: 0, seat: null, updatedAt: 1}], serverNow: 1, version: 1}));
  const atMargin = -5.38 + ROOM_SPACE_COLLISION_EPSILON - 1e-15;
  const serializedMargin = Number(atMargin.toPrecision(14));
  assert.ok(roomSpaceCanStand(atMargin, -2.3));
  assert.ok(!roomSpaceCanStand(serializedMargin, -2.3)); // Movement retains its tighter limit.
  assert.ok(validRoomSpaceSnapshot({players: [{identity: target, name: 'Bob', x: serializedMargin, z: -2.3, yaw: 0, seat: null, updatedAt: 1}], serverNow: 1, version: 1}));
});

test('space API requires connected signed identity, ignores ownership claims and performs real provider removal', async t => {
  config();
  let present = true, ended = false, hit = false, providerFailure = false;
  const actions: {action: string; identity: string; input: Record<string, unknown>}[] = [];
  const removals: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const data = JSON.parse(String(init?.body));
    if (String(url).includes('livekit.cloud')) {
      if (String(url).endsWith('/ListParticipants')) return Response.json({participants: present ? [{identity: actor, name: 'Verified actor'}, {identity: target, name: 'Verified target'}] : []});
      if (String(url).endsWith('/RemoveParticipant')) {
        removals.push(data);
        return providerFailure ? new Response('{}', {status: 503}) : Response.json({});
      }
      return Response.json({});
    }
    const command = (args: unknown[]) => {
      if (String(args[0]).toLowerCase() === 'get') return {result: JSON.stringify({id, state: ended ? 'ENDED' : 'LIVE', expiresAt: Date.now() + 60000})};
      if (String(args[1]).includes('INCR')) return {result: 1};
      const action = String(args[5]);
      const input = JSON.parse(String(args[6]));
      const identity = String(args[8]);
      actions.push({action, input, identity});
      if (hit && action === 'punch') return {result: JSON.stringify({players: [], serverNow: Date.now(), version: 2, removedIdentity: target, reservation: 1})};
      return {result: JSON.stringify({players: [], serverNow: Date.now(), version: 1})};
    };
    return Response.json(Array.isArray(data[0]) ? data.map(command) : command(data));
  });
  const token = musicSession(id, actor, Date.now() + 60000);
  const request = (input?: unknown, extra: Record<string, string> = {}) => new NextRequest(`http://localhost/api/rooms/${id}/space`, {method: input ? 'POST' : 'GET', headers: {authorization: `Bearer ${token}`, origin: 'http://localhost', 'Content-Type': 'application/json', ...extra}, ...(input ? {body: JSON.stringify(input)} : {})});
  assert.equal((await roomSpaceEndpoint(request(), id)).status, 200);
  assert.equal((await roomSpaceEndpoint(request(undefined, {authorization: 'Bearer invalid'}), id)).status, 403);
  assert.equal((await roomSpaceEndpoint(request(), 'b'.repeat(32))).status, 403);
  assert.equal((await roomSpaceEndpoint(request({action: 'punch', target}, {origin: 'https://attacker.test'}), id, true)).status, 403);
  assert.equal((await roomSpaceEndpoint(request({action: 'move', x: Infinity, z: 0, yaw: 0}), id, true)).status, 400);
  assert.equal((await roomSpaceEndpoint(request({action: 'punch', target: actor}), id, true)).status, 400);
  hit = true;
  const result = await roomSpaceEndpoint(request({action: 'punch', target, identity: target, isHost: true}), id, true);
  assert.equal(result.status, 200);
  assert.equal(actions.at(-1)?.identity, actor);
  assert.deepEqual(actions.at(-1)?.input, {target});
  assert.equal(removals[0].identity, target); assert.equal(removals[0].room, `studyflow-${id}`);
  assert.ok(removals[0].revokeTokenTs);
  assert.ok(!(await result.text()).includes('reservation'));
  providerFailure = true;
  assert.equal((await roomSpaceEndpoint(request({action: 'punch', target}), id, true)).status, 503);
  assert.equal(actions.at(-1)?.action, 'rollback');
  present = false; assert.equal((await roomSpaceEndpoint(request(), id)).status, 403);
  ended = true; assert.equal((await roomSpaceEndpoint(request(), id)).status, 410);
});

test('real Redis atomically owns seats, validates movement/reach, cools down hits and rejects ended rooms', {skip: process.env.STUDYFLOW_ROOM_SPACE_REDIS_TEST !== '1'}, async () => {
  const exec = promisify(execFile);
  const command = async (...args: string[]) => JSON.parse((await exec('docker', ['--host=unix:///var/run/docker.sock', 'exec', 'studyflow-room-space-test', 'redis-cli', '--json', ...args])).stdout);
  const roomKey = 'studyflow:room:space-test', spaceKey = 'studyflow:space:space-test';
  const members = [{identity: actor, name: 'Ada'}, {identity: target, name: 'Bob'}];
  const layout = JSON.stringify({bounds: ROOM_SPACE_BOUNDS, obstacles: ROOM_SPACE_OBSTACLES, seats: ROOM_SPACE_SEATS});
  await command('SET', roomKey, JSON.stringify({state: 'LIVE', expiresAt: Date.now() + 60000}));
  await command('DEL', spaceKey);
  const update = async (op = 'snapshot', input = {}, identity = actor) => JSON.parse(await command('EVAL', roomSpaceScript, '2', roomKey, spaceKey, op, JSON.stringify(input), JSON.stringify(members), identity, layout));
  let snapshot = await update();
  assert.equal(snapshot.players.length, 2);
  assert.equal(new Set(snapshot.players.map((p: {seat: number}) => p.seat)).size, 2);
  const racing = JSON.parse(await command('GET', spaceKey));
  for (const player of Object.values(racing.players) as {seat: number | null; x: number; z: number}[]) { player.seat = null; player.x = 4; player.z = -0.55; }
  await command('SET', spaceKey, JSON.stringify(racing));
  const claims = await Promise.all([update('sit', {seat: 2}, actor), update('sit', {seat: 2}, target)]);
  assert.equal(claims.filter(result => result.code === 409).length, 1);
  assert.equal((await update()).players.filter((p: {seat: number}) => p.seat === 2).length, 1);
  await command('DEL', spaceKey);
  snapshot = await update();
  assert.equal((await update('punch', {target})).code, 409); // Seated actor cannot punch.
  snapshot = await update('stand');
  assert.equal(snapshot.players.find((p: {identity: string}) => p.identity === actor).seat, -1); // Internal Lua sentinel; updateRoomSpace emits null.
  assert.equal((await update('sit', {seat: 1})).code, 409); // Occupied seat.
  assert.equal((await update('punch', {target})).code, 409); // Too far away.
  let saved = JSON.parse(await command('GET', spaceKey));
  saved.players[actor].lastMove = Date.now() - 1000;
  await command('SET', spaceKey, JSON.stringify(saved));
  assert.equal((await update('move', {x: 6, z: 4, yaw: 0})).code, 409); // Cannot teleport.
  assert.equal((await update('move', {x: 0, z: -2.3, yaw: 0})).code, 400); // Table collision.
  snapshot = await update('move', {x: -3.5, z: -0.55, yaw: 0});
  assert.equal(snapshot.players.find((p: {identity: string}) => p.identity === actor).x, -3.5);
  saved = JSON.parse(await command('GET', spaceKey));
  saved.players[actor].lastMove = Date.now() + 1000;
  await command('SET', spaceKey, JSON.stringify(saved));
  assert.equal((await update('move', {x: -3.4, z: -0.55, yaw: 0})).code, 429); // Movement throttling.
  saved = JSON.parse(await command('GET', spaceKey));
  saved.players[actor].x = 0; saved.players[actor].z = -0.55; saved.players[actor].lastMove = Date.now() - 1000;
  await command('SET', spaceKey, JSON.stringify(saved));
  snapshot = await update('punch', {target});
  assert.equal(snapshot.removedIdentity, target);
  assert.ok(!snapshot.players.some((p: {identity: string}) => p.identity === target));
  assert.equal((await update('snapshot', {}, target)).code, 403);
  await update('rollback', {target, reservation: snapshot.reservation});
  assert.equal((await update()).players.length, 2);
  assert.equal((await update('punch', {target})).code, 429); // Three-second cooldown survives rollback.
  assert.ok(await command('PTTL', spaceKey) > 0);
  members.pop();
  assert.equal((await update()).players.length, 1);
  await command('SET', roomKey, JSON.stringify({state: 'ENDED', expiresAt: Date.now() + 60000}));
  assert.equal((await update()).code, 410);
  assert.equal(await command('GET', spaceKey), null);
  await command('DEL', roomKey);
});

test('real Redis and Upstash decoding keep E sit/stand valid beside a rounded peer position', {skip: process.env.STUDYFLOW_ROOM_SPACE_REDIS_TEST !== '1'}, async t => {
  config();
  const exec = promisify(execFile);
  const command = async (...args: string[]) => JSON.parse((await exec('docker', ['--host=unix:///var/run/docker.sock', 'exec', 'studyflow-room-space-test', 'redis-cli', '--json', ...args])).stdout);
  // Relay the real Redis result through the same REST response envelope and
  // Upstash SDK deserializer as production, rather than hand-building snapshots.
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://test.upstash.io'));
    const body = JSON.parse(String(init?.body));
    const execute = async (args: unknown[]) => ({result: await command(...args.map(String))});
    return Response.json(Array.isArray(body[0]) ? await Promise.all(body.map(execute)) : await execute(body));
  });
  const roomKey = `studyflow:room:${id}`, spaceKey = `studyflow:space:${id}`;
  const members = Array.from({length: 6}, (_, i) => ({identity: `participant-${String(i + 1).repeat(8)}-${String(i + 1).repeat(4)}-4${String(i + 1).repeat(3)}-8${String(i + 1).repeat(3)}-${String(i + 1).repeat(12)}`, name: `Member ${i + 1}`}));
  await command('SET', roomKey, JSON.stringify({state: 'LIVE', expiresAt: Date.now() + 60000}));
  await command('DEL', spaceKey);
  t.after(async () => { await command('DEL', roomKey, spaceKey); });
  const update = (action = 'snapshot', input = {}, identity = actor) => updateRoomSpace(id, identity, members, action, input);
  assert.ok(validRoomSpaceSnapshot(await update()));
  for (const [seat, member] of members.entries()) {
    const standing = await update('stand', {}, member.identity);
    assert.ok(validRoomSpaceSnapshot(standing), `Standing from chair ${seat + 1} must return valid wire data.`);
    assert.equal(standing.players.find(p => p.identity === member.identity)?.seat, null);
    const seated = await update('sit', {seat}, member.identity);
    assert.ok(validRoomSpaceSnapshot(seated), `Sitting in chair ${seat + 1} must return valid wire data.`);
    assert.equal(seated.players.find(p => p.identity === member.identity)?.seat, seat);
  }
  const saved = JSON.parse(await command('GET', spaceKey));
  Object.assign(saved.players[target], {seat: null, x: -5.5, z: -2.3, lastMove: Date.now() - 1000});
  await command('SET', spaceKey, JSON.stringify(saved));
  const moved = await update('move', {x: -5.380000000000001, z: -2.3, yaw: 0}, target);
  assert.equal(moved.players.find(p => p.identity === target)?.x, -5.38);
  assert.ok(validRoomSpaceSnapshot(moved), 'A legal move must remain valid after Lua JSON encoding.');
  const atMargin = JSON.parse(await command('GET', spaceKey));
  atMargin.players[target].lastMove = Date.now() - 1000;
  await command('SET', spaceKey, JSON.stringify(atMargin));
  assert.ok(validRoomSpaceSnapshot(await update('move', {x: -5.38 + ROOM_SPACE_COLLISION_EPSILON - 1e-15, z: -2.3, yaw: 0}, target)), 'Wire tolerance must also cover JSON rounding at the physics margin.');
  // The rounded position is now persisted. Another user's E action must work
  // without clearing the room state or rejecting the entire players array.
  assert.ok(validRoomSpaceSnapshot(await update('stand')));
  assert.ok(validRoomSpaceSnapshot(await update('sit', {seat: 0})));
  const corrected = JSON.parse(await command('GET', spaceKey));
  corrected.players[target].lastMove = Date.now() - 1000;
  await command('SET', spaceKey, JSON.stringify(corrected));
  await assert.rejects(() => update('move', {x: -5.3, z: -2.3, yaw: 0}, target), /cannot walk through/);
});

test('standing snapshots do not depend on Lua cjson.null and migrate legacy seats', {skip: process.env.STUDYFLOW_ROOM_SPACE_REDIS_TEST !== '1'}, async t => {
  config();
  const exec = promisify(execFile);
  const command = async (...args: string[]) => JSON.parse((await exec('docker', ['--host=unix:///var/run/docker.sock', 'exec', 'studyflow-room-space-test', 'redis-cli', '--json', ...args])).stdout);
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://test.upstash.io'));
    const body = JSON.parse(String(init?.body));
    const execute = async (args: unknown[]) => {
      const wire = args.map(String);
      // Exercise the actual Lua and SDK with a provider that supplies cjson's
      // encode/decode functions but no cjson.null value.
      if (wire[0].toUpperCase() === 'EVAL') wire[1] = `local cjson={encode=cjson.encode,decode=cjson.decode}\n${wire[1]}`;
      return {result: await command(...wire)};
    };
    return Response.json(Array.isArray(body[0]) ? await Promise.all(body.map(execute)) : await execute(body));
  });
  const testId = 'd'.repeat(32), roomKey = `studyflow:room:${testId}`, spaceKey = `studyflow:space:${testId}`;
  const members = Array.from({length: 6}, (_, i) => ({identity: `participant-${String(i + 1).repeat(8)}-${String(i + 1).repeat(4)}-4${String(i + 1).repeat(3)}-8${String(i + 1).repeat(3)}-${String(i + 1).repeat(12)}`, name: `Member ${i + 1}`}));
  await command('SET', roomKey, JSON.stringify({state: 'LIVE', expiresAt: Date.now() + 60000}));
  await command('DEL', spaceKey);
  t.after(async () => { await command('DEL', roomKey, spaceKey); });
  const update = (action = 'snapshot', input = {}, identity = actor) => updateRoomSpace(testId, identity, members, action, input);
  assert.ok(validRoomSpaceSnapshot(await update()));
  for (const [seat, member] of members.entries()) {
    const standing = await update('stand', {}, member.identity);
    assert.ok(validRoomSpaceSnapshot(standing), `Standing from chair ${seat + 1} must preserve a nullable public seat.`);
    assert.equal(standing.players.find(p => p.identity === member.identity)?.seat, null);
    const seated = await update('sit', {seat}, member.identity);
    assert.ok(validRoomSpaceSnapshot(seated));
    assert.equal(seated.players.find(p => p.identity === member.identity)?.seat, seat);
  }
  // Both old Redis encodings must recover without clearing the room. A seated
  // peer in chair zero must retain ownership while standing peers are migrated.
  const legacy = JSON.parse(await command('GET', spaceKey));
  const third = members[2].identity;
  Object.assign(legacy.players[target], {seat: null, z: -0.55, lastMove: Date.now() - 1000});
  Object.assign(legacy.players[third], {z: -0.55, lastMove: Date.now() - 1000});
  delete legacy.players[third].seat;
  await command('SET', spaceKey, JSON.stringify(legacy));
  const migrated = await update();
  assert.ok(validRoomSpaceSnapshot(migrated));
  assert.equal(migrated.players.find(p => p.identity === actor)?.seat, 0);
  assert.equal(migrated.players.find(p => p.identity === target)?.seat, null);
  assert.equal(migrated.players.find(p => p.identity === third)?.seat, null);
  const persisted = JSON.parse(await command('GET', spaceKey));
  assert.equal(persisted.players[target].seat, -1);
  assert.equal(persisted.players[third].seat, -1);
  assert.ok(validRoomSpaceSnapshot(await update('move', {x: 0.1, z: -0.55, yaw: 0}, target)));
  await update('sit', {seat: 1}, target);
  await update('sit', {seat: 2}, third);

  await update('stand');
  const near = JSON.parse(await command('GET', spaceKey));
  Object.assign(near.players[actor], {x: 0, z: -0.55, lastMove: Date.now() - 1000});
  await command('SET', spaceKey, JSON.stringify(near));
  const punched = await update('punch', {target});
  assert.ok(validRoomSpaceSnapshot(punched));
  assert.equal(punched.removedIdentity, target);
  assert.ok(!punched.players.some(p => p.identity === target));
  const rolledBack = await update('rollback', {target, reservation: punched.reservation});
  assert.ok(validRoomSpaceSnapshot(rolledBack));
  assert.equal(rolledBack.players.find(p => p.identity === target)?.seat, 1);
  await update('stand', {}, target);
  await assert.rejects(() => update('punch', {target}), /Only someone sitting/);

  // Legacy rollback reservations may also contain null/omitted seats. Restoring
  // a standing participant must not compete for another standing user's chair.
  for (const missing of [false, true]) {
    const saved = JSON.parse(await command('GET', spaceKey));
    saved.restore[target] = {...saved.players[target], seat: null};
    if (missing) delete saved.restore[target].seat;
    delete saved.players[target];
    const reservation = Date.now() + 60000;
    saved.ejected[target] = reservation;
    await command('SET', spaceKey, JSON.stringify(saved));
    const restored = await update('rollback', {target, reservation});
    assert.ok(validRoomSpaceSnapshot(restored));
    assert.equal(restored.players.find(p => p.identity === target)?.seat, null);
    const stored = JSON.parse(await command('GET', spaceKey));
    assert.equal(stored.players[target].seat, -1);
    assert.equal(stored.restore[target], undefined);
    assert.equal(stored.ejected[target], undefined);
  }
});
