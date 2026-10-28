'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionState, useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { MusicState, MusicTrack } from '@/lib/music-types';
import { musicPosition } from '@/lib/music-timeline';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function MusicPanel({ id, session, isHost }: { id: string; session: string; isHost: boolean }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const audio = useRef<HTMLAudioElement>(null);
  const snapshot = useRef<{state: MusicState; receivedAt: number} | null>(null);
  const pending = useRef(false);
  const lastHint = useRef(0);
  const [state, setState] = useState<MusicState | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const accept = useCallback((value: MusicState, receivedAt: number) => {
    const previous = snapshot.current?.state;
    if (previous && (value.version < previous.version || (value.version === previous.version && value.serverNow < previous.serverNow))) return;
    snapshot.current = {state: value, receivedAt}; setState(value);
  }, []);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const start = performance.now();
    try {
      const response = await fetch(`/api/rooms/${id}/music`, { cache: 'no-store', headers: {Authorization: `Bearer ${session}`} });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Music is unavailable.');
      accept(value, (start + performance.now()) / 2); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Music connection interrupted.'); }
    finally { pending.current = false; }
  }, [id, session, accept]);
  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    const initial = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 2000);
    const changed = (_payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== 'studyflow.music.changed' || performance.now() - lastHint.current < 1000) return;
      lastHint.current = performance.now(); void load();
    };
    room.on(RoomEvent.DataReceived, changed);
    return () => { clearTimeout(initial); clearInterval(poll); room.off(RoomEvent.DataReceived, changed); };
  }, [connection, load, room]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/music/tracks', {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error('Music library is unavailable.');
      const data = await response.json(); setTracks(data.tracks);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);

  const track = tracks.find(track => track.id === state?.current?.trackId);
  const sync = useCallback(() => {
    const current = snapshot.current, player = audio.current;
    if (!current || !player) return;
    const s = current.state;
    const position = musicPosition(s, performance.now() - current.receivedAt);
    setProgress(position);
    if (!enabled || s.status !== 'PLAYING' || !s.current || connection !== ConnectionState.Connected || performance.now() - current.receivedAt > 10000) { player.pause(); return; }
    if (player.readyState > 0 && Math.abs(player.currentTime - position) > 1) player.currentTime = position;
    if (player.paused && !player.ended) void player.play().catch(() => { setEnabled(false); setAudioError('Playback was blocked. Click Enable Room Music to try again.'); });
  }, [enabled, connection]);
  useEffect(() => { const tick = setInterval(sync, 500); return () => clearInterval(tick); }, [sync]);
  useEffect(() => {
    const player = audio.current;
    if (player) { player.volume = volume; player.muted = muted; }
  }, [volume, muted]);
  useEffect(() => () => { snapshot.current = null; }, []);

  async function action(path: string, method = 'POST', data: unknown = {}) {
    setBusy(true); setError('');
    const start = performance.now();
    try {
      const response = await fetch(`/api/rooms/${id}/music/${path}`, { method, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${session}`}, body: method === 'DELETE' ? undefined : JSON.stringify({...data as object, expectedVersion: snapshot.current?.state.version}) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Music action failed.');
      accept(value, (start + performance.now()) / 2);
    } catch (e) { setError(e instanceof Error ? e.message : 'Music action failed.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-border bg-card p-4" open>
    <summary className="cursor-pointer text-sm font-medium">Room Music</summary>
    <div className="mt-4 space-y-4">
      <audio key={state?.current?.id || 'idle'} ref={audio} src={track?.audioUrl} preload="metadata" onLoadedMetadata={() => { if (audio.current) { audio.current.volume = volume; audio.current.muted = muted; } sync(); }} onEnded={() => void load()} onError={() => setAudioError('This audio could not be loaded. Check your connection or ask the creator to skip it.')} />
      <div><p className="text-sm font-medium">{track ? `${track.title} — ${track.artist}` : 'No song playing'}</p><p className="mt-1 text-xs text-muted-foreground">{state?.status || 'Loading music…'}</p></div>
      <progress aria-label="Music progress" className="h-2 w-full accent-primary" max={track?.durationSeconds || 1} value={progress} />
      <p className="text-xs text-muted-foreground">{clock(progress)} / {clock(track?.durationSeconds || 0)}</p>
      <Button size="sm" variant="outline" onClick={() => {
        setAudioError(''); setEnabled(!enabled);
        if (enabled) audio.current?.pause();
        else if (state?.status === 'PLAYING') void audio.current?.play().catch(() => { setEnabled(false); setAudioError('Click Enable Room Music again to allow audio.'); });
      }}>{enabled ? 'Disable Room Music' : 'Enable Room Music'}</Button>
      <div className="flex items-center gap-3"><Label htmlFor={`music-volume-${id}`}>Your volume</Label><input id={`music-volume-${id}`} aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} className="min-w-0 flex-1 accent-primary" /><Button size="sm" variant="ghost" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute music' : 'Mute music'}</Button></div>
      <p className="text-xs leading-5 text-muted-foreground">Use headphones to avoid echo with your microphone. Music volume affects only you. Exclude this tab’s audio when screen sharing.</p>
      {isHost && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !state || (!state.current && !state.queue.length)} onClick={() => void action(state?.status === 'PLAYING' ? 'pause' : 'play')}>{state?.status === 'PLAYING' ? 'Pause for everyone' : 'Play for everyone'}</Button><Button size="sm" variant="outline" disabled={busy || !state?.current} onClick={() => void action('skip')}>Skip</Button></div>}
      {(error || audioError) && <p role="alert" className="text-xs text-destructive">{error || audioError}</p>}
      <h3 className="text-sm font-medium">Shared queue ({state?.queue.length || 0}/20)</h3>
      {!state?.queue.length ? <p className="text-xs text-muted-foreground">The queue is empty. Request a song below; the creator starts playback.</p> : <ol className="max-h-48 space-y-3 overflow-auto">{state.queue.map((item, i) => {
        const song = tracks.find(track => track.id === item.trackId);
        return <li key={item.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 break-words">{i + 1}. {song?.title || item.trackId} — {song?.artist}<br /><span className="text-muted-foreground">Requested by {item.requestedBy} · {clock(item.durationSeconds)}</span></span>{isHost && <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${song?.title || item.trackId}`} onClick={() => void action(`queue/${item.id}`, 'DELETE')}>Remove</Button>}</li>;
      })}</ol>}
      <Label htmlFor={`music-search-${id}`}>Music library</Label><Input id={`music-search-${id}`} placeholder="Search title or artist…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="max-h-64 space-y-3 overflow-auto">{tracks.filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase())).map(song => <div key={song.id} className="space-y-2 rounded-md border border-border p-3"><p className="text-sm">{song.title} — {song.artist}</p><p className="text-xs text-muted-foreground">{clock(song.durationSeconds)} · {song.licenseInfo}</p><Button size="sm" variant="outline" disabled={busy || connection !== ConnectionState.Connected || state?.current?.trackId === song.id || state?.queue.some(item => item.trackId === song.id)} onClick={() => void action('requests', 'POST', {trackId: song.id})}>Request Song</Button></div>)}{!tracks.length && <p className="text-xs text-muted-foreground">No authorized tracks are available.</p>}</div>
    </div>
  </details>;
}
