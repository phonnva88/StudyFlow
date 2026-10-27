import { Redis } from "@upstash/redis";
import { configuration } from "./config";
import { HttpError } from "./validation";
export const ROOM_TTL = 60 * 60 * 12;
export type RoomState = "CREATED" | "LIVE" | "ENDED";
export interface StudyRoom {
  id: string;
  title: string;
  hostName: string;
  hostHash: string;
  state: RoomState;
  createdAt: number;
  expiresAt: number;
}
function redis() {
  const config = configuration();
  return new Redis({ url: config.redisUrl, token: config.redisToken });
}
const key = (id: string) => `studyflow:room:${id}`;
export async function createRecord(room: StudyRoom) {
  const result = await redis().set(key(room.id), room, {
    nx: true,
    ex: ROOM_TTL,
  });
  if (!result)
    throw new HttpError(409, "Could not reserve the room. Please try again.");
}
export async function getRecord(
  id: string,
  allowEnded = false,
): Promise<StudyRoom> {
  const room = await redis().get<StudyRoom>(key(id));
  if (!room)
    throw new HttpError(404, "This room does not exist or has expired.");
  if (!allowEnded && (room.state === "ENDED" || room.expiresAt <= Date.now()))
    throw new HttpError(410, "This livestream has ended.");
  return room;
}
// Atomic transition; an ended room can never become LIVE again. Preserve its TTL.
export async function transition(id: string, next: "LIVE" | "ENDED") {
  const result = await redis().eval<[string], number>(
    `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return 0 end
    local room = cjson.decode(raw)
    if room.state == 'ENDED' and ARGV[1] ~= 'ENDED' then return -1 end
    room.state = ARGV[1]
    redis.call('SET', KEYS[1], cjson.encode(room), 'KEEPTTL')
    return 1
  `,
    [key(id)],
    [next],
  );
  if (result === 0) throw new HttpError(404, "Room not found.");
  if (result === -1) throw new HttpError(410, "This livestream has ended.");
}
export async function rateLimit(scope: string, limit: number, seconds: number) {
  const count = await redis().eval<[string], number>(
    `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
  `,
    [`studyflow:limit:${scope}`],
    [String(seconds)],
  );
  if (count > limit)
    throw new HttpError(
      429,
      "Too many requests. Please wait a moment and try again.",
    );
}
export const publicRoom = (room: StudyRoom) => ({
  id: room.id,
  title: room.title,
  hostName: room.hostName,
  state: room.state,
  expiresAt: room.expiresAt,
});
