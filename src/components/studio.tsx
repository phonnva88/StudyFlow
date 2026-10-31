'use client';

import { useEffect, useState } from 'react';
import {
  RoomAudioRenderer, StartAudio, VideoTrack, useTracks, useParticipants,
  useLocalParticipant, useRoomContext, useConnectionState, useIsMuted,
  useParticipantInfo, isTrackReference, type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import { LoaderCircle, LogOut, Mic, MicOff, MonitorUp, Users, Video, VideoOff } from 'lucide-react';
import { api, type RoomInfo } from './room-client';
import { Chat } from './chat';
import { AttendanceProvider,AttendanceTimer,leaveAttendance } from './attendance';
import { MusicPanel } from './music-panel';
import { RoomSpacePanel, type RoomView } from './room-space-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function StudyTile({ track }: { track: TrackReferenceOrPlaceholder }) {
  const { name } = useParticipantInfo({ participant: track.participant });
  const cameraMuted = useIsMuted(track);
  const microphoneMuted = useIsMuted({ participant: track.participant, source: Track.Source.Microphone });
  const screen = track.source === Track.Source.ScreenShare;
  const nickname = name || 'Guest';
  return (
    <article aria-label={`${nickname}${screen ? ' screen share' : ' camera'}`} className={`relative flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card ${screen ? 'min-h-52' : ''}`}>
      {isTrackReference(track) && !cameraMuted ? (
        <VideoTrack trackRef={track} className={`absolute inset-0 size-full ${screen ? 'object-contain' : 'object-cover'}`} />
      ) : (
        <div className="flex flex-col items-center gap-3 p-4 text-muted-foreground">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl text-primary" aria-hidden="true">{nickname.slice(0, 1).toUpperCase()}</span>
          <span className="text-xs">{screen ? 'Screen share paused' : 'Camera off'}</span>
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-md bg-background/85 px-2 py-1.5 text-xs backdrop-blur">
        <span className="min-w-0 truncate">{nickname}{track.participant.isLocal ? ' · You' : ''}{screen ? ' · Screen' : ''}</span>
        <AttendanceTimer identity={track.participant.identity} />
        <span aria-label={microphoneMuted ? 'Microphone muted' : 'Microphone on'}>{microphoneMuted ? <MicOff className="size-4 text-muted-foreground" /> : <Mic className="size-4 text-primary" />}</span>
      </div>
    </article>
  );
}

export function Studio({ info, musicSession, view, onViewChange, onKnockedOut, onEnded, onLeave }: { info: RoomInfo; musicSession: string; view: RoomView; onViewChange: (view: RoomView) => void; onKnockedOut: () => void; onEnded: () => void; onLeave: () => void }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ], { onlySubscribed: false });
  const screens = tracks.filter(track => track.source === Track.Source.ScreenShare);
  // Exactly one camera (or placeholder) per identity, independent of screen shares.
  const cameras = [...new Map(tracks.filter(track => track.source === Track.Source.Camera).map(track => [track.participant.identity, track])).values()];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const screenSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  useEffect(() => {
    const removed = (payload: Uint8Array, participant?: unknown, _kind?: unknown, topic?: string) => {
      // Only the server can send a packet without a participant identity.
      if (participant || topic !== 'studyflow.space.changed' || payload.byteLength > 512) return;
      try { if (JSON.parse(new TextDecoder().decode(payload)).removedIdentity === localParticipant.identity) onKnockedOut(); } catch {}
    };
    room.on(RoomEvent.DataReceived, removed);
    return () => { room.off(RoomEvent.DataReceived, removed); };
  }, [room, localParticipant.identity, onKnockedOut]);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); }
    catch (event) {
      const name = event instanceof Error ? event.name : '';
      setError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Permission was denied or screen sharing was cancelled. Allow device access in your browser and try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No matching device was found. Connect a camera or microphone and try again.'
          : event instanceof Error ? event.message : 'Action failed. Check device permissions and try again.');
    }
    finally { setBusy(false); }
  }
  const connected = connection === ConnectionState.Connected;

  return (
    <AttendanceProvider id={info.id} session={musicSession}><main className="mx-auto grid max-w-7xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground" role="status">
          <span className="inline-flex items-center gap-2">{!connected && <LoaderCircle className="size-4 animate-spin" />}{connected ? 'Everyone can share. Make yourself at home.' : connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting ? 'Reconnecting… Your place is kept while we reconnect.' : 'Connecting to your study room…'}</span>
          <span className="inline-flex items-center gap-2"><Users className="size-4" />{participants.length}/6 participants</span>
        </div>
        <div role="group" aria-label="Room view" className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant={view === 'grid' ? 'secondary' : 'outline'} aria-pressed={view === 'grid'} onClick={() => onViewChange('grid')}>Grid view</Button>
          <Button size="sm" variant={view === 'first-person' ? 'secondary' : 'outline'} aria-pressed={view === 'first-person'} onClick={() => onViewChange('first-person')}>First-person view</Button>
        </div>
        {!!screens.length && <section aria-label="Shared screens" className={`mb-4 grid gap-3 ${screens.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {screens.map(track => <StudyTile key={`${track.participant.identity}:screen`} track={track} />)}
        </section>}
        <section aria-label="Study participants" className={`${view === 'grid' ? 'grid' : 'hidden'} gap-3 ${cameras.length > 1 ? 'sm:grid-cols-2' : ''} ${cameras.length > 4 && !screens.length ? 'xl:grid-cols-3' : ''}`}>
          {cameras.map(track => <StudyTile key={track.participant.identity} track={track} />)}
        </section>
        <RoomSpacePanel id={info.id} session={musicSession} view={view} />
        {view==='first-person' && <div aria-label="Room attendance" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">{participants.map(p=><span key={p.identity} className="inline-flex max-w-full items-center gap-2"><span className="truncate">{p.name || 'Guest'}{p.isLocal?' · You':''}</span><AttendanceTimer identity={p.identity}/></span>)}</div>}
        <RoomAudioRenderer />
        <StartAudio label="Enable room audio" className="mt-3 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-accent" />

        <div role="toolbar" aria-label="Your media controls" className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
          <Button variant={isCameraEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || !connected} onClick={() => void action(() => localParticipant.setCameraEnabled(!isCameraEnabled))} aria-pressed={isCameraEnabled} aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{isCameraEnabled ? <Video /> : <VideoOff />}Camera</Button>
          <Button variant={isMicrophoneEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || !connected} onClick={() => void action(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} aria-pressed={isMicrophoneEnabled} aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Enable microphone'}>{isMicrophoneEnabled ? <Mic /> : <MicOff />}Mic</Button>
          <Button variant={isScreenShareEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || !connected || !screenSupported} aria-pressed={isScreenShareEnabled} onClick={() => void action(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true }))}><MonitorUp />{isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}</Button>
          <Button variant="outline" size="sm" disabled={busy} className="sm:ml-auto" onClick={() => void action(async()=>{await leaveAttendance(info.id,musicSession);onLeave();await room.disconnect();})}><LogOut />Leave</Button>
          {info.isHost && <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmEnd(true)}>End room</Button>}
        </div>
        {!screenSupported && <p className="mt-3 text-xs text-muted-foreground">Screen sharing is unavailable in this browser. Try desktop Chrome or Edge over HTTPS.</p>}
        {error && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200" role="alert">{error}</p>}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Camera and microphone start off. Anyone can share; leaving keeps the room open for everyone else.</p>

        {info.isHost && <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
          <DialogContent>
            <DialogHeader><DialogTitle>End this study room?</DialogTitle><DialogDescription>This disconnects everyone and closes the room permanently. To leave it open, use Leave instead.</DialogDescription></DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Keep studying</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void action(async () => { await api(`/api/rooms/${info.id}/end`); onEnded(); })}>{busy ? 'Ending…' : 'End for everyone'}</Button>
            </DialogFooter>
            {error && <p className="text-sm text-destructive" role="alert">{error} Retry ending to finish closing the media session.</p>}
          </DialogContent>
        </Dialog>}
      </section>
      <aside className="min-w-0 space-y-4"><Chat /><MusicPanel id={info.id} session={musicSession} isHost={info.isHost} /></aside>
    </main></AttendanceProvider>
  );
}
