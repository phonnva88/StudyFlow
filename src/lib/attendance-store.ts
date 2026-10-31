import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { configuration } from './config';
import { HttpError } from './validation';
import { roomService, livekitRoom } from './livekit';
import type { AttendanceSnapshot } from './attendance';

// A monotonically increasing observation number prevents a slower presence
// request from overwriting a more recent one on another Vercel instance.
export const attendanceScript = `
local raw=redis.call('GET',KEYS[1])
if not raw then return cjson.encode({error='Room not found.',code=404}) end
local room=cjson.decode(raw)
local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
if room.state=='ENDED' or room.expiresAt<=now then redis.call('DEL',KEYS[2]); return cjson.encode({error='This room has ended.',code=410}) end
local saved=redis.call('GET',KEYS[2]); local s=saved and cjson.decode(saved) or {players={},sequence=0}
local members=cjson.decode(ARGV[1]); local seq=tonumber(ARGV[2]); local mode=ARGV[3]; local identity=ARGV[4]
local function disconnect(p,at)
 if p.status=='CONNECTED' then
  p.accumulatedMs=p.accumulatedMs+math.max(0,at-p.connectedSince); p.disconnectedAt=at; p.status='RECONNECTING'
  p.departures=p.departures or {}; p.departures[p.sid]={start=p.connectedSince,untilTime=at,verified=false}
 end
end
if seq>s.sequence then
 s.sequence=seq
 local present={}
 for _,m in ipairs(members) do
  if m.joinedAt<=0 then m.joinedAt=now end
  m.joinedAt=math.min(m.joinedAt,now)
  present[m.identity]=true
  local p=s.players[m.identity]
  if not p or p.lastDepartureSid~=m.sid then
  if not p or (not p.closed and p.status=='LEFT') or (p.status=='RECONNECTING' and m.joinedAt-p.disconnectedAt>30000) then
   p={participantId=m.identity,visitId=ARGV[5]..':'..m.identity,joinedAt=m.joinedAt,connectedSince=m.joinedAt,disconnectedAt=0,accumulatedMs=0,status='CONNECTED',sid=m.sid,lastSeen=now}
   s.players[m.identity]=p
  elseif p.status~='LEFT' then
   if p.status=='CONNECTED' and p.sid~=m.sid then disconnect(p,math.min(p.lastSeen,m.joinedAt)) end
   if p.status=='RECONNECTING' then
    if m.joinedAt-p.disconnectedAt>30000 then
     p.visitId=ARGV[5]..':'..m.identity; p.joinedAt=m.joinedAt; p.accumulatedMs=0
    end
    p.connectedSince=math.max(p.disconnectedAt,m.joinedAt); p.disconnectedAt=0; p.status='CONNECTED'
   end
   p.sid=m.sid; p.lastSeen=now
  end
  else present[m.identity]=nil end
 end
 for id,p in pairs(s.players) do
  if not present[id] and p.status=='CONNECTED' then
   -- Without a webhook the exact departure is unknown: never count beyond
   -- confirmed presence. Grace begins at the first missing observation.
   disconnect(p,p.lastSeen); p.disconnectedAt=now
  end
  if p.status=='RECONNECTING' and now-p.disconnectedAt>30000 then p.status='LEFT' end
 end
end
local p=s.players[identity]
if mode=='leave' and p then
 if p.status~='LEFT' then disconnect(p,now); p.disconnectedAt=now end
 p.status='LEFT'; p.closed=true
end
if mode=='webhook-left' and p and not p.closed then
 local at=math.min(now,tonumber(ARGV[7]))
 if p.sid==ARGV[6] and p.status=='CONNECTED' and at>=p.connectedSince then disconnect(p,at) end
 local departure=p.departures and p.departures[ARGV[6]]
 if departure and not departure.verified and at>=departure.start then
  -- Correct an older segment even if a newer SID is already connected. This
  -- changes its credited time once, without disconnecting the newer session.
  p.accumulatedMs=math.max(0,p.accumulatedMs+at-departure.untilTime)
  departure.untilTime=at; departure.verified=true
  if p.sid==ARGV[6] then p.disconnectedAt=at; p.lastDepartureSid=ARGV[6] end
 end
end
redis.call('SET',KEYS[2],cjson.encode(s)); redis.call('PEXPIREAT',KEYS[2],room.expiresAt)
local result={}
for _,v in pairs(s.players) do table.insert(result,{participantId=v.participantId,visitId=v.visitId,joinedAt=v.joinedAt,connectedSince=v.connectedSince,disconnectedAt=v.disconnectedAt,accumulatedMs=v.accumulatedMs,status=v.status}) end
return cjson.encode({serverNow=now,participants=result})
`;
function db() { const c=configuration(); return new Redis({url:c.redisUrl,token:c.redisToken}); }
export async function closeAttendance(id:string,identity:string) {
  return db().eval(attendanceScript,[`studyflow:room:${id}`,`studyflow:attendance:${id}`],['[]',0,'leave',identity,randomUUID(),' ',0]);
}
export async function attendanceState(id: string, mode='snapshot', identity='', sid='', at=0) {
  const redis=db();
  const seq=await redis.incr(`studyflow:attendance-seq:${id}`);
  await redis.expire(`studyflow:attendance-seq:${id}`, 43200);
  let present: Awaited<ReturnType<ReturnType<typeof roomService>['listParticipants']>>;
  try { present=await roomService().listParticipants(livekitRoom(id)); }
  catch(error) { if(error && typeof error==='object' && 'code' in error && error.code==='not_found') present=[]; else throw new HttpError(503,'Room attendance presence is unavailable. Please retry.'); }
  const members=present.filter(p=>/^participant-[a-f0-9-]{36}$/.test(p.identity)).map(p=>({identity:p.identity,sid:p.sid,joinedAt:Number(p.joinedAtMs || p.joinedAt*1000n)}));
  const raw=await redis.eval(attendanceScript,[`studyflow:room:${id}`,`studyflow:attendance:${id}`],[JSON.stringify(members),seq,mode,identity,randomUUID(),sid,at]);
  const result=(typeof raw==='string'?JSON.parse(raw):raw) as AttendanceSnapshot & {error?:string;code?:number};
  if(result.error) throw new HttpError(result.code || 503,result.error);
  if(!Array.isArray(result.participants)) result.participants=[];
  return {snapshot:result,present};
}
