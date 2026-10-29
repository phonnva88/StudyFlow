// Shared, deterministic room geometry used by both the renderer and Redis validation.
export const ROOM_SPACE_BOUNDS = { minX: -7, maxX: 7, minZ: -5, maxZ: 5 };
export const ROOM_SPACE_EYE_HEIGHT = 1.65;
export const ROOM_SPACE_SPEED = 3.5;
export const ROOM_SPACE_PUNCH_REACH = 2.2;
export const ROOM_SPACE_SEATS = [-1.4, 2.4].flatMap(z => [-4, 0, 4].map(x => ({ x, z, yaw: 0 })));
export const ROOM_SPACE_OBSTACLES = [
  ...ROOM_SPACE_SEATS.map(seat => ({x: seat.x, z: seat.z - 0.9, width: 2.2, depth: 0.9})),
  {x: 0, z: -4.55, width: 13, depth: 0.7},
];
export interface RoomSpacePlayer { identity: string; name: string; x: number; z: number; yaw: number; seat: number | null; updatedAt: number }
export interface RoomSpaceSnapshot { players: RoomSpacePlayer[]; serverNow: number; version: number; removedIdentity?: string }
export type RoomSpaceAction = {action: 'move'; x: number; z: number; yaw: number} | {action: 'sit'; seat: number} | {action: 'stand'} | {action: 'punch'; target: string};
export function roomSpaceCanStand(x: number, z: number) {
  const r = 0.28, b = ROOM_SPACE_BOUNDS;
  return Number.isFinite(x) && Number.isFinite(z) && x >= b.minX + r && x <= b.maxX - r && z >= b.minZ + r && z <= b.maxZ - r &&
    !ROOM_SPACE_OBSTACLES.some(o => Math.abs(x - o.x) < o.width / 2 + r && Math.abs(z - o.z) < o.depth / 2 + r);
}
export function validRoomSpaceSnapshot(value: unknown): value is RoomSpaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as RoomSpaceSnapshot;
  return Number.isFinite(s.serverNow) && Number.isSafeInteger(s.version) && s.version >= 0 && Array.isArray(s.players) && s.players.length <= 6 && s.players.every(p =>
    !!p && typeof p === 'object' && typeof p.identity === 'string' && /^participant-[a-f0-9-]{36}$/.test(p.identity) && typeof p.name === 'string' && p.name.length <= 32 &&
    roomSpaceCanStand(p.x, p.z) && Number.isFinite(p.yaw) && Math.abs(p.yaw) <= Math.PI * 2 && Number.isFinite(p.updatedAt) &&
    (p.seat === null || (Number.isInteger(p.seat) && p.seat >= 0 && p.seat < ROOM_SPACE_SEATS.length)));
}
