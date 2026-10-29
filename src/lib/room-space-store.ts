import { Redis } from '@upstash/redis';
import { configuration } from './config';
import { HttpError } from './validation';
import { ROOM_SPACE_BOUNDS, ROOM_SPACE_OBSTACLES, ROOM_SPACE_SEATS, ROOM_SPACE_PUNCH_REACH, ROOM_SPACE_SPEED, ROOM_SPACE_COLLISION_EPSILON, type RoomSpaceSnapshot } from './room-space';

const layout = JSON.stringify({bounds: ROOM_SPACE_BOUNDS, obstacles: ROOM_SPACE_OBSTACLES, seats: ROOM_SPACE_SEATS});
// One room-scoped transaction validates movement, seat ownership and hit distance.
// All security decisions use this state and Redis TIME, never peer Data Messages.
export const roomSpaceScript = `
local raw=redis.call('GET',KEYS[1])
local t=redis.call('TIME')
local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local function err(code,message) return cjson.encode({code=code,error=message}) end
if not raw then return err(404,'Room not found.') end
local room=cjson.decode(raw)
if room.state=='ENDED' or room.expiresAt<=now then redis.call('DEL',KEYS[2]); return err(410,'This study room has ended.') end
local saved=redis.call('GET',KEYS[2])
local state=saved and cjson.decode(saved) or {players={},ejected={},restore={},version=0}
if not state.restore then state.restore={} end
-- Keep standing seats numeric without depending on a provider's cjson.null.
-- Migrate old null/omitted seats before any occupancy or interaction checks.
for _,p in pairs(state.players) do if type(p.seat)~='number' then p.seat=-1 end end
for _,p in pairs(state.restore) do if type(p.seat)~='number' then p.seat=-1 end end
local op=ARGV[1]
local input=cjson.decode(ARGV[2])
local connected=cjson.decode(ARGV[3])
local identity=ARGV[4]
local geometry=cjson.decode(ARGV[5])
local present={}
for _,member in ipairs(connected) do present[member.identity]=member.name end
if not present[identity] then return err(403,'Connect to this study room first.') end
for id,_ in pairs(state.players) do if not present[id] then state.players[id]=nil; state.version=state.version+1 end end
for id,untilTime in pairs(state.ejected) do if untilTime<now then state.ejected[id]=nil; state.restore[id]=nil end end
local function persist()
  redis.call('SET',KEYS[2],cjson.encode(state))
  redis.call('PEXPIREAT',KEYS[2],room.expiresAt)
end
if op=='rollback' then
  if state.ejected[input.target] and state.ejected[input.target]==input.reservation then
    local previous=state.restore[input.target]
    local free=true
    if previous and previous.seat>=0 then for _,p in pairs(state.players) do if p.seat==previous.seat then free=false end end end
    if previous and free and present[input.target] then state.players[input.target]=previous end
    state.ejected[input.target]=nil; state.restore[input.target]=nil; state.version=state.version+1
  end
end
if state.ejected[identity] then return err(403,'You were knocked out of this study room. Rejoin to take another seat.') end
local occupied={}
for _,p in pairs(state.players) do if p.seat>=0 then occupied[p.seat]=true end end
for _,member in ipairs(connected) do
  if not state.players[member.identity] and not state.ejected[member.identity] then
    local index=nil
    for i,_ in ipairs(geometry.seats) do if not occupied[i-1] then index=i-1; break end end
    local spawn=index and geometry.seats[index+1] or {x=0,z=4,yaw=0}
    state.players[member.identity]={identity=member.identity,name=member.name,x=spawn.x,z=spawn.z,yaw=spawn.yaw,seat=index or -1,updatedAt=now,lastMove=now,lastPunch=0}
    if index then occupied[index]=true end
    state.version=state.version+1
  end
end
local actor=state.players[identity]
actor.name=present[identity]
local function standable(x,z)
  local r=0.28; local b=geometry.bounds; local epsilon=${ROOM_SPACE_COLLISION_EPSILON}
  if x<b.minX+r-epsilon or x>b.maxX-r+epsilon or z<b.minZ+r-epsilon or z>b.maxZ-r+epsilon then return false end
  for _,o in ipairs(geometry.obstacles) do if math.abs(x-o.x)<o.width/2+r-epsilon and math.abs(z-o.z)<o.depth/2+r-epsilon then return false end end
  return true
end
local removed=nil
local reservation=nil
if op=='move' then
  if actor.seat>=0 then return err(409,'Stand up before walking.') end
  if now-actor.lastMove<160 then return err(429,'Movement updates are too frequent.') end
  if not standable(input.x,input.z) then return err(400,'You cannot walk through walls or furniture.') end
  local distance=math.sqrt((input.x-actor.x)^2+(input.z-actor.z)^2)
  local allowance=${ROOM_SPACE_SPEED}*math.max(0.1,math.min(1,(now-actor.lastMove)/1000))
  if distance>allowance+0.03 then return err(409,'Movement was too fast. Your position has been refreshed.') end
  local steps=math.max(1,math.ceil(distance/0.12))
  for i=1,steps do if not standable(actor.x+(input.x-actor.x)*i/steps,actor.z+(input.z-actor.z)*i/steps) then return err(400,'You cannot walk through furniture.') end end
  actor.x=input.x; actor.z=input.z; actor.yaw=input.yaw; actor.updatedAt=now; actor.lastMove=now; state.version=state.version+1
elseif op=='stand' then
  if actor.seat>=0 then
    local seat=geometry.seats[actor.seat+1]
    actor.x=seat.x; actor.z=seat.z+0.85; actor.seat=-1; actor.updatedAt=now; actor.lastMove=now; state.version=state.version+1
  end
elseif op=='sit' then
  if actor.seat>=0 then return err(409,'Stand up before choosing another chair.') end
  local seat=geometry.seats[input.seat+1]
  if not seat then return err(400,'Choose an available chair.') end
  for _,p in pairs(state.players) do if p.seat==input.seat then return err(409,'That chair is occupied.') end end
  if (actor.x-seat.x)^2+(actor.z-seat.z)^2>2.25 then return err(409,'Walk closer to the chair first.') end
  actor.x=seat.x; actor.z=seat.z; actor.yaw=seat.yaw; actor.seat=input.seat; actor.updatedAt=now; actor.lastMove=now; state.version=state.version+1
elseif op=='punch' then
  if input.target==identity then return err(400,'You cannot punch yourself.') end
  if actor.seat>=0 then return err(409,'Stand up and approach an occupied chair first.') end
  local target=state.players[input.target]
  if not target or not present[input.target] then return err(404,'That participant has left.') end
  if target.seat<0 then return err(409,'Only someone sitting in a chair can be knocked out.') end
  if (actor.x-target.x)^2+(actor.z-target.z)^2>${ROOM_SPACE_PUNCH_REACH * ROOM_SPACE_PUNCH_REACH} then return err(409,'Move closer to the occupied chair first.') end
  if now-actor.lastPunch<3000 then return err(429,'Wait three seconds between punches.') end
  actor.lastPunch=now
  reservation=now+60000
  state.ejected[input.target]=reservation
  state.restore[input.target]=target
  state.players[input.target]=nil
  removed=input.target; state.version=state.version+1
elseif op~='snapshot' and op~='rollback' then return err(400,'Unknown room interaction.') end
persist()
local players={}
for _,p in pairs(state.players) do table.insert(players,{identity=p.identity,name=p.name,x=p.x,z=p.z,yaw=p.yaw,seat=p.seat,updatedAt=p.updatedAt}) end
return cjson.encode({players=players,serverNow=now,version=state.version,removedIdentity=removed,reservation=reservation})
`;

export interface ConnectedSpaceMember { identity: string; name: string }
export async function updateRoomSpace(id: string, identity: string, connected: ConnectedSpaceMember[], action = 'snapshot', input: Record<string, unknown> = {}) {
  const c = configuration();
  const redis = new Redis({url: c.redisUrl, token: c.redisToken});
  const raw = await redis.eval(roomSpaceScript, [`studyflow:room:${id}`, `studyflow:space:${id}`], [action, JSON.stringify(input), JSON.stringify(connected), identity, layout]);
  const result = (typeof raw === 'string' ? JSON.parse(raw) : raw) as RoomSpaceSnapshot & {code?: number; error?: string; reservation?: number};
  if (result.error) throw new HttpError(result.code || 409, result.error);
  if (!Array.isArray(result.players)) result.players = [];
  // The public contract always includes seat:null for standing participants;
  // the Lua sentinel never reaches browser snapshots.
  for (const player of result.players) if (player.seat === -1) player.seat = null;
  return result;
}
