'use client';

import { useState } from 'react';
import {
  RoomAudioRenderer, StartAudio, VideoTrack, useTracks, useParticipants,
  useLocalParticipant, useRoomContext, useConnectionState,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { LoaderCircle, LogOut, Mic, MicOff, MonitorUp, Radio, Users, Video, VideoOff } from 'lucide-react';
import { api, type RoomInfo } from './room-client';
import { Chat } from './chat';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function Studio({ info, refresh, onEnded }: { info: RoomInfo; refresh: () => void; onEnded: () => void }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.ScreenShare, Track.Source.Camera]);
  const hostIdentity = `host-${info.id}`;
  const host = participants.find(participant => participant.identity === hostIdentity);
  const hostTracks = tracks.filter(track => track.participant.identity === hostIdentity);
  const screen = hostTracks.find(track => track.source === Track.Source.ScreenShare);
  const camera = hostTracks.find(track => track.source === Track.Source.Camera);
  const main = screen || camera;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); }
    catch (event) { setError(event instanceof Error ? event.message : 'Action failed. Check device permissions and try again.'); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!isCameraEnabled && !isScreenShareEnabled) await localParticipant.setCameraEnabled(true);
    await api(`/api/rooms/${info.id}/start`);
    refresh();
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0">
        <div className="relative flex aspect-video min-h-60 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-2 text-[10px] tracking-wider backdrop-blur"><span className={`size-2 rounded-full ${connection === ConnectionState.Reconnecting ? 'bg-amber-400' : 'bg-primary'}`} />{connection === ConnectionState.Reconnecting ? 'RECONNECTING' : info.state === 'LIVE' ? 'LIVE SESSION' : 'STUDIO PREVIEW'}</span>
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-2 text-xs backdrop-blur"><Users className="size-4" />{participants.filter(participant => participant.identity !== hostIdentity).length}</span>
          </div>
          {main ? <VideoTrack trackRef={main} className="absolute inset-0 size-full object-contain" /> : (
            <div className="max-w-md px-5 text-center">
              <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">{connection !== ConnectionState.Connected ? <LoaderCircle className="animate-spin" /> : <Radio />}</span>
              <h2 className="text-xl font-medium">{connection !== ConnectionState.Connected ? 'Connecting to your space…' : info.isHost ? 'Make yourself at home.' : !host ? 'Waiting for your host' : 'A quiet moment.'}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{info.isHost ? 'Turn on your camera or share your screen to begin.' : !host ? 'They’ll be here soon. Your session will appear here.' : 'The host’s camera is off. Audio and chat are still available.'}</p>
            </div>
          )}
          {screen && camera && <div className="absolute bottom-4 right-4 aspect-video w-1/4 overflow-hidden rounded-lg border border-primary/50 bg-card"><VideoTrack trackRef={camera} className="size-full object-cover" /></div>}
          <span className="absolute bottom-4 left-4 rounded bg-background/80 px-2 py-1 text-xs backdrop-blur">{info.hostName}{info.isHost ? ' · You' : ''}</span>
        </div>
        <RoomAudioRenderer />
        <StartAudio label="Enable livestream audio" className="mt-3 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-accent" />

        <div className="flex flex-wrap items-center gap-2 border-b border-border py-4">
          {info.isHost ? <>
            <div className="mr-auto flex flex-wrap gap-2">
              <Button variant={isCameraEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || connection !== ConnectionState.Connected} onClick={() => void action(() => localParticipant.setCameraEnabled(!isCameraEnabled))} aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{isCameraEnabled ? <Video /> : <VideoOff />}Camera</Button>
              <Button variant={isMicrophoneEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || connection !== ConnectionState.Connected} onClick={() => void action(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Enable microphone'}>{isMicrophoneEnabled ? <Mic /> : <MicOff />}Mic</Button>
              <Button variant={isScreenShareEnabled ? 'secondary' : 'outline'} size="sm" disabled={busy || connection !== ConnectionState.Connected} onClick={() => void action(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true }))}><MonitorUp />{isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}</Button>
            </div>
            {info.state !== 'LIVE' && <Button disabled={busy || connection !== ConnectionState.Connected} onClick={() => void action(start)}><Radio />Go live</Button>}
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmEnd(true)}>End stream</Button>
          </> : <>
            <p className="mr-auto text-xs text-muted-foreground">You’re here to focus. Settle in.</p>
            <Button variant="outline" size="sm" onClick={() => void room.disconnect()}><LogOut />Leave</Button>
          </>}
        </div>
        {error && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200" role="alert">{error}</p>}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{info.isHost ? 'Only you can broadcast. Your invite link lets viewers watch and chat.' : 'Enjoy the session. Your camera and microphone stay private.'}</p>

        <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Call it a session?</DialogTitle><DialogDescription>Ending the livestream disconnects everyone and closes this room permanently.</DialogDescription></DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Keep studying</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void action(async () => { await api(`/api/rooms/${info.id}/end`); onEnded(); })}>{busy ? 'Ending…' : 'End for everyone'}</Button>
            </DialogFooter>
            {error && <p className="text-sm text-destructive" role="alert">{error} Retry ending to finish closing the media session.</p>}
          </DialogContent>
        </Dialog>
      </section>
      <Chat />
    </main>
  );
}
