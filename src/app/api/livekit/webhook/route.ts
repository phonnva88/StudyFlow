import { WebhookReceiver } from 'livekit-server-sdk';
import type { NextRequest } from 'next/server';
import { configuration } from '@/lib/config';
import { attendanceState } from '@/lib/attendance-store';
import { getRecord } from '@/lib/room-store';
import { fail,json } from '@/lib/http';
import { HttpError } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  try {
    const c=configuration();
    const raw=await request.text();
    if(Buffer.byteLength(raw)>65536) throw new HttpError(413,'Webhook is too large.');
    let event;
    try { event=await new WebhookReceiver(c.key,c.secret).receive(raw,request.headers.get('authorization') || ''); }
    catch { throw new HttpError(401,'Invalid webhook signature.'); }
    const id=event.room?.name.match(/^studyflow-([a-f0-9]{32})$/)?.[1];
    if(!id) return json({ok:true});
    try { await getRecord(id); } catch(error) { if(error instanceof HttpError && [404,410].includes(error.status)) return json({ok:true}); throw error; }
    if(event.event==='participant_left' && event.participant) {
      await attendanceState(id,'webhook-left',event.participant.identity,event.participant.sid,Number(event.createdAt)*1000);
    } else if(event.event==='participant_joined' || event.event==='room_finished') await attendanceState(id);
    return json({ok:true});
  } catch(error) { return fail(error); }
}
