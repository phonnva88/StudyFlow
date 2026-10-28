import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { configuration } from './config';
import { HttpError } from './validation';
import { musicTracks } from './music-catalog';
import type { MusicState } from './music-types';

// One Lua transaction serializes queue mutations, playback and lazy advancement.
// Redis TIME is authoritative. Inactivity pauses rather than draining a playlist.
export const musicScript = `
local raw = redis.call('GET', KEYS[1])
local time = redis.call('TIME')
local now = tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000)
if not raw then return cjson.encode({error='Room not found.',code=404}) end
local room = cjson.decode(raw)
if room.state == 'ENDED' or room.expiresAt <= now then
  redis.call('DEL', KEYS[2])
  return cjson.encode({error='This study room has ended.',code=410})
end
local saved = redis.call('GET', KEYS[2])
local s = saved and cjson.decode(saved) or {current=cjson.null,queue={},status='IDLE',positionSeconds=0,startedAt=cjson.null,version=0,lastSeen=now}
local changed = false
local op=ARGV[1]
local data=cjson.decode(ARGV[2])
if data.expectedVersion and data.expectedVersion ~= s.version then
  return cjson.encode({error='Playback changed. Refresh and try again.',code=409})
end
local function advance(start)
  if #s.queue > 0 then
    s.current=table.remove(s.queue,1); s.status='PLAYING'; s.startedAt=start; s.positionSeconds=0
  else s.current=cjson.null; s.status='IDLE'; s.startedAt=cjson.null; s.positionSeconds=0 end
  changed=true
end
if s.status == 'PLAYING' then
  local effective = now
  if now-s.lastSeen > 10000 then effective=s.lastSeen end
  while s.current ~= cjson.null and s.status == 'PLAYING' and
    s.positionSeconds+(effective-s.startedAt)/1000 >= s.current.durationSeconds do
    local finish=s.startedAt+(s.current.durationSeconds-s.positionSeconds)*1000
    advance(finish)
  end
  if now-s.lastSeen > 10000 and s.status == 'PLAYING' then
    s.positionSeconds=s.positionSeconds+math.max(0,(effective-s.startedAt)/1000)
    s.startedAt=cjson.null; s.status='PAUSED'; changed=true
  end
end
if op == 'request' then
  if #s.queue >= 20 then return cjson.encode({error='The queue is full (20 requests).',code=409}) end
  if s.current ~= cjson.null and s.current.trackId == data.trackId then return cjson.encode({error='That song is already playing.',code=409}) end
  for _,item in ipairs(s.queue) do if item.trackId == data.trackId then return cjson.encode({error='That song is already queued.',code=409}) end end
  table.insert(s.queue,data); changed=true
elseif op == 'play' then
  if s.current == cjson.null then advance(now)
  elseif s.status ~= 'PLAYING' then s.status='PLAYING'; s.startedAt=now; changed=true end
elseif op == 'pause' and s.status == 'PLAYING' then
  s.positionSeconds=s.positionSeconds+math.max(0,(now-s.startedAt)/1000)
  s.status='PAUSED'; s.startedAt=cjson.null; changed=true
elseif op == 'skip' then advance(now)
elseif op == 'remove' then
  for i,item in ipairs(s.queue) do if item.id == data.id then table.remove(s.queue,i); changed=true; break end end
end
if changed then s.version=s.version+1 end
s.lastSeen=now
redis.call('SET',KEYS[2],cjson.encode(s))
redis.call('PEXPIREAT',KEYS[2],room.expiresAt)
s.serverNow=now
s.changed=changed
return cjson.encode(s)
`;
export async function updateMusic(id: string, op: string, data: Record<string, unknown> = {}): Promise<MusicState> {
  const c = configuration();
  const redis = new Redis({ url: c.redisUrl, token: c.redisToken });
  const raw = await redis.eval(musicScript, [`studyflow:room:${id}`, `studyflow:music:${id}`], [op, JSON.stringify(data)]);
  const state = (typeof raw === 'string' ? JSON.parse(raw) : raw) as MusicState & {error?: string; code?: number};
  if (state.error) throw new HttpError(state.code || 409, state.error);
  // Redis Lua encodes an empty table as {}; always expose arrays to clients.
  if (!Array.isArray(state.queue)) state.queue = [];
  return state;
}
export function requestedTrack(trackId: unknown, requestedBy: string) {
  const track = musicTracks.find(track => track.id === trackId);
  if (!track) throw new HttpError(400, 'Choose a song from the authorized music catalog.');
  return { id: randomUUID(), trackId: track.id, durationSeconds: track.durationSeconds, requestedBy, requestedAt: Date.now() };
}
