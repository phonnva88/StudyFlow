'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { ConnectionState } from 'livekit-client';
import { useConnectionState, useLocalParticipant } from '@livekit/components-react';
import { Button } from './ui/button';
import { RoomSpaceClient } from '@/lib/room-space-client';
import { ROOM_SPACE_PUNCH_REACH, ROOM_SPACE_SEATS, type RoomSpaceAction, type RoomSpaceSnapshot } from '@/lib/room-space';

const FirstPersonCanvas = dynamic(() => import('./first-person/canvas'), {ssr: false, loading: () => <p role="status">Opening first-person view…</p>});
export type RoomView = 'grid' | 'first-person';

export function RoomSpacePanel({id, session, view}: {id: string; session: string; view: RoomView}) {
  const {localParticipant} = useLocalParticipant();
  const connection = useConnectionState();
  const [snapshot, setSnapshot] = useState<RoomSpaceSnapshot>({players: [], version: 0, serverNow: 0});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<'loading' | 'loaded' | 'missing'>('loading');
  const [controller] = useState(() => new RoomSpaceClient());
  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    return controller.start(id, localParticipant.identity, session, setSnapshot, setError);
  }, [controller, id, localParticipant.identity, session, connection]);
  const interact = useCallback(async (action: RoomSpaceAction) => { setBusy(true); try { await controller.act(action); } finally { setBusy(false); } }, [controller]);
  useEffect(() => {
    controller.setEnabled(view === 'first-person' && connection === ConnectionState.Connected && !busy && !error);
    controller.setInteraction(target => { void interact(target.target ? {action: 'punch', target: target.target} : target.seat !== undefined ? {action: 'sit', seat: target.seat} : {action: 'stand'}); });
  }, [controller, view, connection, busy, error, snapshot, interact]);
  const own = snapshot.players.find(p => p.identity === localParticipant.identity);
  const unavailable = busy || connection !== ConnectionState.Connected || !!error;
  // Remain mounted in Grid mode so everyone retains a server-owned chair.
  return <section aria-label="Room interactions" className={view === 'grid' ? 'mt-4 space-y-2' : 'space-y-3'}>
    {view === 'first-person' && <><FirstPersonCanvas bridge={controller} onModelStatus={setModel} />
      {model === 'missing' && <p role="status" className="text-xs text-muted-foreground">Showing the built-in 3D library.</p>}
      <p className="text-xs text-muted-foreground">Click the scene to look around. WASD / arrows to walk, E to sit or stand, F to punch. Escape releases the mouse. Punching a nearby seated participant removes them from this room; they can rejoin.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={unavailable || !own || own.seat === null} onClick={() => void interact({action: 'stand'})}>Stand up</Button>
        {ROOM_SPACE_SEATS.map((seat, i) => { const occupant = snapshot.players.find(p => p.seat === i); return <Button key={i} size="sm" variant="outline" disabled={unavailable || !own || own.seat !== null || !!occupant || Math.hypot(controller.local.x - seat.x, controller.local.z - seat.z) > 1.5} onClick={() => void interact({action: 'sit', seat: i})}>Chair {i + 1}{occupant ? ` · ${occupant.name}` : ''}</Button>; })}
      </div>
      <div className="flex flex-wrap gap-2">{snapshot.players.filter(p => p.identity !== localParticipant.identity && p.seat !== null).map(p => <Button key={p.identity} size="sm" variant="destructive" disabled={unavailable || !own || own.seat !== null || Math.hypot(controller.local.x - p.x, controller.local.z - p.z) > ROOM_SPACE_PUNCH_REACH} onClick={() => void interact({action: 'punch', target: p.identity})}>Punch {p.name} out</Button>)}</div>
    </>}
    {view === 'grid' && <p className="text-xs text-muted-foreground">{own?.seat !== null && own?.seat !== undefined ? `You are in chair ${own.seat + 1}.` : 'Your place in the library is kept.'} Switch to first-person view to walk and interact. Seated participants can be punched out of the room in either view.</p>}
    {error && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" disabled={busy || connection !== ConnectionState.Connected} onClick={() => void controller.read()}>Retry room interactions</Button></div>}
  </section>;
}
