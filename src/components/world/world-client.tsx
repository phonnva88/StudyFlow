'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SiteHeader } from '../site-header';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { CreateRoomForm } from '../create-room-form';
import { AVATAR_COLORS, mapDesks, publicWorldRoom } from '@/lib/world';
import { worldPresence } from '@/lib/world-presence';
import { WorldBridge } from '@/lib/world-bridge';
import type { DiscoveryRoom } from '@/lib/discovery-types';

const WorldCanvas = dynamic(() => import('./world-canvas'), {ssr: false, loading: () => <p role="status">Opening the library…</p>});
type Profile = {nickname: string; color: string};

function LibrarySession({profile, leave}: {profile: Profile; leave: () => void}) {
  const [status, setStatus] = useState('connecting');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [loading, setLoading] = useState(true);
  const [desks, setDesks] = useState<(DiscoveryRoom | null)[]>(Array(8).fill(null));
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [bridge] = useState(() => {
    const instance = new WorldBridge(profile.nickname, profile.color, slot => { setSelectedRoomId(instance.desks[slot]?.id || null); setSelected(slot); });
    return instance;
  });
  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    const presence = worldPresence(bridge.model, (state, total) => {
      if (disposed) return;
      setStatus(state); setCount(total);
      if (state !== 'connected') bridge.setEnabled(false);
    });
    void (async () => {
      try {
        const response = await fetch('/api/world/token', {method: 'POST', signal: abort.signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({nickname: profile.nickname, avatarColor: profile.color})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to enter the library.');
        if (!disposed) await presence.connect(data.serverUrl, data.token);
      } catch (e) { if (!disposed) { setError(e instanceof Error ? e.message : 'Unable to connect.'); setStatus('disconnected'); bridge.setEnabled(false); } }
    })();
    return () => { disposed = true; abort.abort(); presence.dispose(); };
  }, [bridge, profile, retry]);
  const loadRooms = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/rooms', {cache: 'no-store', signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Rooms are temporarily unavailable.');
      if (!Array.isArray(data.rooms)) throw new Error('Invalid room listing. Please try again.');
      if (signal?.aborted) return;
      bridge.setDesks(mapDesks(bridge.desks, data.rooms.filter(publicWorldRoom)));
      setDesks(bridge.desks); setRoomError('');
    } catch (e) {
      if (signal?.aborted) return;
      bridge.setDesks(Array(8).fill(null)); setDesks(bridge.desks);
      setRoomError(e instanceof Error ? e.message : 'Rooms are temporarily unavailable.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [bridge]);
  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    const refresh = async () => { if (pending) return; pending = true; try { await loadRooms(abort.signal); } finally { pending = false; } };
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 12000);
    return () => { abort.abort(); clearTimeout(initial); clearInterval(timer); };
  }, [loadRooms]);
  useEffect(() => { bridge.setEnabled(selected === null && status === 'connected'); }, [bridge, selected, status]);
  const chosen = selected !== null && selected >= 0 && desks[selected]?.id === selectedRoomId ? desks[selected] : null;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm"><span className="mr-2 inline-block size-2 rounded-full bg-primary" />{status === 'connected' ? `${count} in the library` : status === 'reconnecting' || status === 'signalReconnecting' ? 'Reconnecting…' : status === 'disconnected' ? 'Library disconnected' : 'Connecting…'}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setSelected(-1)}>Create Room</Button><Button variant="ghost" size="sm" onClick={leave}>Leave world / change avatar</Button></div></div>
    {(error || status === 'disconnected') && <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4"><p className="text-sm">{error || 'Connection lost. Re-enter the library to see other students.'}</p><Button variant="outline" onClick={() => { setError(''); setStatus('connecting'); setRetry(n => n + 1); }}>Reconnect</Button></div>}
    <WorldCanvas bridge={bridge} />
    <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2"><p>Click the library to focus. Walk with <kbd>WASD</kbd> or arrow keys; press <kbd>E</kbd> near a desk. You can also tap any desk.</p><p>Your camera and microphone stay off. Enter a study room to share media, chat, or listen to music. On mobile, tap a desk or use the list below.</p></div>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Study desks</h2><Button asChild variant="outline" size="sm"><Link href="/explore">View All Rooms</Link></Button></div>
    {loading ? <p role="status">Finding public rooms…</p> : roomError ? <div role="alert" className="space-y-2"><p>{roomError}</p><Button variant="outline" onClick={() => void loadRooms()}>Retry room list</Button></div> : !desks.some(Boolean) ? <p className="text-sm text-muted-foreground">No public rooms yet. Stop by reception to create the first one.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{desks.map((room, i) => room && <Button key={room.id} variant="outline" className="h-auto min-w-0 flex-col items-start gap-2 whitespace-normal p-4 text-left" onClick={() => bridge.interact(i)}><span className="text-xs text-muted-foreground">Desk {i + 1} · {room.status} · {room.participantCount}/{room.maxParticipants}</span><span className="break-all">{room.title}</span></Button>)}</div>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle>{selected === -1 ? 'Make room for focus.' : chosen?.title || 'An open study desk'}</DialogTitle>
      <DialogDescription>{selected === -1 ? 'Start a room from the library reception.' : chosen ? `Created by ${chosen.hostName} · ${chosen.participantCount}/${chosen.maxParticipants} participants · ${chosen.status}` : 'This desk has no available public room right now. Create one or browse all rooms.'}</DialogDescription>
      {selected === -1 ? <CreateRoomForm id="world-create-room" nickname={profile.nickname} /> : chosen ? <><p className="text-xs text-muted-foreground">Availability is checked again when you join. Everyone can share camera, microphone, and screen inside.</p>{chosen.status === 'FULL' ? <Button disabled>Room full</Button> : <Button asChild><Link href={`/room/${chosen.id}`}>Join Room</Link></Button>}</> : <Button onClick={() => setSelected(-1)}>Create Room</Button>}
    </DialogContent></Dialog>
  </div>;
}

export function WorldClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('studyflow-world-profile') || 'null');
      if (saved && typeof saved.nickname === 'string' && saved.nickname.length <= 32 && AVATAR_COLORS.includes(saved.color)) {
        const initial = setTimeout(() => { setNickname(saved.nickname); setColor(saved.color); }, 0);
        return () => clearTimeout(initial);
      }
    } catch { /* Session storage can be disabled. */ }
  }, []);
  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6"><div><p className="mb-2 text-xs tracking-widest text-primary">A LITTLE WORLD FOR FOCUS</p><h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Your seat at the library.</h1><p className="mt-3 text-sm text-muted-foreground">Wander in, find some company, and settle into a study room.</p></div>
    {profile ? <LibrarySession profile={profile} leave={() => setProfile(null)} /> : <form className="mx-auto max-w-md space-y-6 rounded-xl border border-border bg-card p-6" onSubmit={event => { event.preventDefault(); const next = {nickname: nickname.trim(), color}; if (!next.nickname || /[\u0000-\u001f\u007f]/.test(next.nickname)) return; try { sessionStorage.setItem('studyflow-world-profile', JSON.stringify(next)); } catch {} setProfile(next); }}>
      <div className="space-y-2"><Label htmlFor="world-nickname">Your nickname</Label><Input id="world-nickname" required maxLength={32} value={nickname} onChange={e => setNickname(e.target.value)} autoComplete="nickname" /></div>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Avatar color</legend><div className="flex flex-wrap gap-3">{AVATAR_COLORS.map((value, i) => <label key={value} className="cursor-pointer rounded-lg border border-border p-2 has-checked:ring-2 has-checked:ring-primary"><input className="sr-only" type="radio" name="avatar-color" value={value} checked={color === value} onChange={() => setColor(value)} aria-label={['Sage', 'Amber', 'Lavender', 'Rose', 'Sky', 'Gold'][i]} /><span aria-hidden className="block size-7 rounded-sm" style={{backgroundColor: value}} /></label>)}</div></fieldset>
      <Button className="w-full">Enter library</Button><p className="text-xs text-muted-foreground">No account needed. Your nickname is visible to other students.</p>
    </form>}
  </main></div>;
}
