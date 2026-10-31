'use client';
import { createContext,useContext,useEffect,useState,useCallback,type ReactNode } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { attendanceSeconds,formatAttendance,type AttendanceSnapshot } from '@/lib/attendance';

const AttendanceContext=createContext<{snapshot:AttendanceSnapshot;offset:number;error:string}>({snapshot:{participants:[],serverNow:0},offset:0,error:''});
export function AttendanceProvider({id,session,children}:{id:string;session:string;children:ReactNode}) {
  const room=useRoomContext();
  const [state,setState]=useState({snapshot:{participants:[],serverNow:0} as AttendanceSnapshot,offset:0,error:''});
  useEffect(()=>{
    let disposed=false,pending=false;
    const controller=new AbortController();
    const refresh=async()=>{
      if(pending) return; pending=true;
      const start=Date.now();
      try {
        const response=await fetch(`/api/rooms/${id}/attendance`,{cache:'no-store',headers:{Authorization:`Bearer ${session}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        const snapshot=await response.json();
        if(!response.ok) throw new Error(snapshot.error || 'Attendance unavailable.');
        if(!Array.isArray(snapshot.participants) || !Number.isFinite(snapshot.serverNow)) throw new Error('Attendance unavailable.');
        if(!disposed) setState({snapshot,offset:snapshot.serverNow-(start+Date.now())/2,error:''});
      } catch { if(!disposed) setState(s=>({...s,error:'Attendance temporarily unavailable.'})); }
      finally { pending=false; }
    };
    const update=()=>{void refresh();};
    const visible=()=>{if(!document.hidden) update();};
    update(); const timer=setInterval(update,5000);
    room.on(RoomEvent.ParticipantConnected,update).on(RoomEvent.ParticipantDisconnected,update).on(RoomEvent.Reconnected,update);
    document.addEventListener('visibilitychange',visible);
    return ()=>{disposed=true;controller.abort();clearInterval(timer);room.off(RoomEvent.ParticipantConnected,update).off(RoomEvent.ParticipantDisconnected,update).off(RoomEvent.Reconnected,update);document.removeEventListener('visibilitychange',visible);};
  },[id,session,room]);
  return <AttendanceContext.Provider value={state}>{children}</AttendanceContext.Provider>;
}
export function AttendanceTimer({identity}:{identity:string}) {
  const {snapshot,offset,error}=useContext(AttendanceContext);
  const [now,setNow]=useState(0);
  const tick=useCallback(()=>setNow(Date.now()),[]);
  useEffect(()=>{const initial=setTimeout(tick,0);const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[tick]);
  const visit=snapshot.participants.find(p=>p.participantId===identity);
  // Freeze stale observations rather than implying unverified connected time.
  const time=error?snapshot.serverNow:Math.min(now+offset,snapshot.serverNow+10000);
  return <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground" title={error || 'Time present in this room'} aria-label="Room attendance">{visit&&now?formatAttendance(attendanceSeconds(visit,time)):'--:--:--'}</span>;
}
export async function leaveAttendance(id:string,session:string) {
  const response=await fetch(`/api/rooms/${id}/attendance/leave`,{method:'POST',headers:{Authorization:`Bearer ${session}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error('Unable to close your attendance visit. Please retry leaving.');
}
