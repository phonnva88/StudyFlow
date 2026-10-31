import type { NextRequest } from 'next/server';
import { fail,json,sameOrigin } from './http';
import { getRecord,rateLimit } from './room-store';
import { roomId,HttpError } from './validation';
import { verifyMusicSession } from './music-session';
import { attendanceState } from './attendance-store';
import { livekitRoom,roomService } from './livekit';

export async function attendanceEndpoint(request: NextRequest, rawId:string, mode:'snapshot'|'me'|'leave'='snapshot') {
  try {
    if(mode==='leave') sameOrigin(request);
    const id=roomId(rawId); await getRecord(id);
    const identity=verifyMusicSession(request.headers.get('authorization')?.replace(/^Bearer /,'') || '',id);
    await rateLimit(`attendance:${id}:${identity}`,60,60);
    const {snapshot,present}=await attendanceState(id,mode==='leave'?'leave':'snapshot',identity);
    if(mode==='leave') {
      if(present.some(p=>p.identity===identity)) await roomService().removeParticipant(livekitRoom(id),identity,{revokeTokenTs:BigInt(Math.floor(Date.now()/1000)+1)});
      return json({visit:snapshot.participants.find(p=>p.participantId===identity) || null,serverNow:snapshot.serverNow});
    }
    if(!present.some(p=>p.identity===identity)) throw new HttpError(403,'Connect to this room before viewing attendance.');
    return json(mode==='me'?{visit:snapshot.participants.find(p=>p.participantId===identity) || null,serverNow:snapshot.serverNow}:{...snapshot,participants:snapshot.participants.filter(p=>p.status!=='LEFT')});
  } catch(error) { return fail(error); }
}
