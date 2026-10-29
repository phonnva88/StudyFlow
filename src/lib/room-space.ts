// Shared, deterministic room geometry used by both the renderer and Redis validation.
export const ROOM_SPACE_BOUNDS = { minX: -7, maxX: 7, minZ: -5, maxZ: 5 };
export const ROOM_SPACE_EYE_HEIGHT = 1.65;
export const ROOM_SPACE_SPEED = 3.5;
export const ROOM_SPACE_PUNCH_REACH = 2.2;
// Redis Lua cjson rounds doubles to 14 significant digits. A valid position
// next to furniture can return on the other side of an exact JS comparison.
// Keep this numerical margin in both collision engines (10 nanometres).
export const ROOM_SPACE_COLLISION_EPSILON = 1e-8;
// Reading a serialized position needs a little more room than movement itself:
// otherwise JSON rounding can cross the collision margin's own boundary.
const ROOM_SPACE_SNAPSHOT_EPSILON = ROOM_SPACE_COLLISION_EPSILON * 2;
export const ROOM_SPACE_SEATS = [-1.4, 2.4].flatMap(z => [-4, 0, 4].map(x => ({ x, z, yaw: 0 })));
export const ROOM_SPACE_OBSTACLES = [
  ...ROOM_SPACE_SEATS.map(seat => ({x: seat.x, z: seat.z - 0.9, width: 2.2, depth: 0.9})),
  {x: 0, z: -4.55, width: 13, depth: 0.7},
];
export interface RoomSpacePlayer { identity: string; name: string; x: number; z: number; yaw: number; seat: number | null; updatedAt: number }
export interface RoomSpaceSnapshot { players: RoomSpacePlayer[]; serverNow: number; version: number; removedIdentity?: string }
export type RoomSpaceAction = {action: 'move'; x: number; z: number; yaw: number} | {action: 'sit'; seat: number} | {action: 'stand'} | {action: 'punch'; target: string};
export function roomSpaceCanStand(x: number, z: number, epsilon = ROOM_SPACE_COLLISION_EPSILON) {
  const r = 0.28, b = ROOM_SPACE_BOUNDS;
  return Number.isFinite(x) && Number.isFinite(z) && x >= b.minX + r - epsilon && x <= b.maxX - r + epsilon && z >= b.minZ + r - epsilon && z <= b.maxZ - r + epsilon &&
    !ROOM_SPACE_OBSTACLES.some(o => Math.abs(x - o.x) < o.width / 2 + r - epsilon && Math.abs(z - o.z) < o.depth / 2 + r - epsilon);
}
export function validRoomSpaceSnapshot(value: unknown): value is RoomSpaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as RoomSpaceSnapshot;
  return Number.isFinite(s.serverNow) && Number.isSafeInteger(s.version) && s.version >= 0 && Array.isArray(s.players) && s.players.length <= 6 && s.players.every(p =>
    !!p && typeof p === 'object' && typeof p.identity === 'string' && /^participant-[a-f0-9-]{36}$/.test(p.identity) && typeof p.name === 'string' && p.name.length <= 32 &&
    roomSpaceCanStand(p.x, p.z, ROOM_SPACE_SNAPSHOT_EPSILON) && Number.isFinite(p.yaw) && Math.abs(p.yaw) <= Math.PI * 2 && Number.isFinite(p.updatedAt) &&
    (p.seat === null || (Number.isInteger(p.seat) && p.seat >= 0 && p.seat < ROOM_SPACE_SEATS.length)));
}
