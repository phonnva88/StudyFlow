import type { DiscoveryRoom } from './discovery-types';

export const WORLD_ROOM = 'studyflow-world-library-v1';
export const WORLD_CAPACITY = 20;
export const WORLD_WIDTH = 640;
export const WORLD_HEIGHT = 480;
export const AVATAR_COLORS = ['#90b9a2', '#e4ad79', '#a7a0d5', '#d99099', '#83b6cf', '#d1bf72'] as const;
export const SPAWN = { x: 320, y: 438 };
export const DESKS = [160, 320, 480].flatMap(x => [178, 304].map(y => ({ x, y }))).concat([{x: 96, y: 388}, {x: 544, y: 388}]);
export const RECEPTION = { x: 92, y: 92 };
export const OBSTACLES = [
  ...DESKS.map(({x, y}) => ({x: x - 36, y: y - 18, width: 72, height: 50})),
  {x: 48, y: 64, width: 88, height: 40},
  ...[208, 328, 448].map(x => ({x, y: 32, width: 88, height: 40})),
  ...[{x: 40, y: 174}, {x: 580, y: 174}, {x: 40, y: 310}, {x: 580, y: 310}].map(p => ({...p, width: 20, height: 24})),
];
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Motion { x: number; y: number; direction: Direction; animation: 'idle' | 'walking'; seq: number }
export interface WorldAvatar extends Motion { playerId: string; nickname: string; avatarColor: string; seenAt: number }
export function canStand(x: number, y: number) {
  const r = 9;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 25 && x <= WORLD_WIDTH - 25 && y >= 84 && y <= WORLD_HEIGHT - 25 &&
    !OBSTACLES.some(o => x + r > o.x && x - r < o.x + o.width && y + r > o.y && y - r < o.y + o.height);
}
export function readMotion(value: unknown): Motion | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Motion;
  return canStand(p.x, p.y) && ['up', 'down', 'left', 'right'].includes(p.direction) && ['idle', 'walking'].includes(p.animation) && Number.isSafeInteger(p.seq) && p.seq >= 0
    ? {x: p.x, y: p.y, direction: p.direction, animation: p.animation, seq: p.seq} : null;
}
export function publicWorldRoom(value: unknown): value is DiscoveryRoom {
  if (!value || typeof value !== 'object') return false;
  const r = value as DiscoveryRoom;
  return typeof r.id === 'string' && /^[a-f0-9]{32}$/.test(r.id) && r.visibility === 'PUBLIC' &&
    typeof r.title === 'string' && r.title.length <= 80 && typeof r.hostName === 'string' && r.hostName.length <= 32 &&
    ['ACTIVE', 'EMPTY', 'FULL'].includes(r.status) && Number.isInteger(r.participantCount) && r.participantCount >= 0 &&
    Number.isInteger(r.maxParticipants) && r.maxParticipants > 0 && Number.isFinite(r.createdAt) && Number.isFinite(r.expiresAt) && r.expiresAt > Date.now();
}
// Retain occupied slots across refreshes; only fill vacancies by priority.
export function mapDesks(previous: (DiscoveryRoom | null)[], rooms: DiscoveryRoom[]) {
  const byId = new Map(rooms.map(r => [r.id, r]));
  const slots = Array.from({length: 8}, (_, i) => byId.get(previous[i]?.id || '') || null);
  const used = new Set(slots.filter(r => r !== null).map(r => r.id));
  const remaining = rooms.filter(r => !used.has(r.id)).sort((a, b) => Number(a.status === 'FULL') - Number(b.status === 'FULL') || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || b.createdAt - a.createdAt);
  return slots.map(r => r || remaining.shift() || null);
}
