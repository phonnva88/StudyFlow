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
  // Missing on legacy invite-only rooms. Never publish those implicitly.
  visibility?: "PUBLIC" | "PRIVATE";
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
    throw new HttpError(410, "This study room has ended.");
  return room;
}
// Scan the existing TTL-backed records rather than maintaining a second index
// that could drift from creation/expiry. Suitable for this small-room MVP.
export async function listPublicRecords(): Promise<StudyRoom[]> {
  const db = redis();
  const rooms = new Map<string, StudyRoom>();
  let cursor = "0";
  do {
    const [next, keys]: [string, string[]] = await db.scan(cursor, {
      match: "studyflow:room:*",
      count: 100,
    });
    cursor = next;
    for (let offset = 0; offset < keys.length; offset += 100) {
      const records = await db.mget<(StudyRoom | null)[]>(...keys.slice(offset, offset + 100));
      for (const room of records) {
        if (room && room.visibility === "PUBLIC" && room.state !== "ENDED" && room.expiresAt > Date.now())
          rooms.set(room.id, room);
      }
    }
  } while (String(cursor) !== "0");
  return [...rooms.values()];
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
    if ARGV[1] == 'ENDED' then redis.call('DEL', KEYS[2]) end
    redis.call('SET', KEYS[1], cjson.encode(room), 'KEEPTTL')
    return 1
  `,
    [key(id), `studyflow:music:${id}`],
    [next],
  );
  if (result === 0) throw new HttpError(404, "Room not found.");
  if (result === -1) throw new HttpError(410, "This study room has ended.");
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
  visibility: room.visibility ?? "PRIVATE",
  createdAt: room.createdAt,
  expiresAt: room.expiresAt,
  createdAt: room.createdAt,
  visibility: room.visibility ?? "PRIVATE",
});

// SCAN works across existing metadata without a migration or a second index.
// Deduplicate keys: Redis SCAN may return a key more than once.
export async function listPublicRecords(): Promise<StudyRoom[]> {
  const client = redis();
  let cursor = "0";
  const keys = new Set<string>();
  do {
    const page = await client.scan(cursor, { match: "studyflow:room:*", count: 100 });
    cursor = String(page[0]);
    for (const value of page[1]) keys.add(value);
  } while (cursor !== "0");
  const rooms: StudyRoom[] = [];
  const allKeys = [...keys];
  for (let i = 0; i < allKeys.length; i += 100) {
    const records = await client.mget<(StudyRoom | null)[]>(...allKeys.slice(i, i + 100));
    rooms.push(...records.filter((room): room is StudyRoom => !!room &&
      /^[a-f0-9]{32}$/.test(room.id) && room.visibility === "PUBLIC" &&
      room.state !== "ENDED" && room.expiresAt > Date.now()));
  }
  return rooms;
}
