'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import { DisconnectReason } from 'livekit-client';
import { ArrowRight, Check, Copy, LoaderCircle, Radio } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Studio } from '@/components/studio';
import type { RoomView } from '@/components/room-space-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface RoomInfo {
  id: string;
  title: string;
  hostName: string;
  state: 'CREATED' | 'LIVE' | 'ENDED';
  expiresAt: number;
  isHost: boolean;
  status?: 'ACTIVE' | 'EMPTY' | 'FULL';
  participantCount?: number;
  maxParticipants?: number;
}

export async function api(path: string, data: unknown = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export function InviteButton() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
          setCopied(true);
          setFailed(false);
        } catch { setFailed(true); }
      }}>
        {copied ? <Check /> : <Copy />}{copied ? 'Link copied' : 'Copy invite link'}
      </Button>
      {failed && <span className="hidden text-xs text-muted-foreground sm:inline" role="status">Copy the URL from your browser’s address bar.</span>}
    </div>
  );
}

export function RoomClient({ id }: { id: string }) {
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [nickname, setNickname] = useState('');
  const [session, setSession] = useState<{ token: string; serverUrl: string; isHost: boolean; musicSession: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [view, setView] = useState<RoomView>('grid');
  const knockedOut = useRef(false);
  const resumeAttempted = useRef(false);
  const storageKey = `studyflow-visit:${id}`;
  function forgetVisit() { try { sessionStorage.removeItem(storageKey); } catch {} }
  const canResume=!!info && !ended;
  useEffect(()=>{
    if(!canResume || resumeAttempted.current) return;
    let saved;
    try { saved=JSON.parse(sessionStorage.getItem(`studyflow-visit:${id}`) || 'null'); } catch { return; }
    if(!saved?.session || typeof saved.nickname!=='string') return;
    let disposed=false;
    const initial=setTimeout(()=>{
    resumeAttempted.current=true;setBusy(true);
    void api(`/api/rooms/${id}/token`,{nickname:saved.nickname,resumeSession:saved.session}).then(next=>{
      if(disposed) return;
      try { sessionStorage.setItem(`studyflow-visit:${id}`,JSON.stringify({session:next.musicSession,nickname:saved.nickname})); } catch {}
      setSession(next);
    }).catch(()=>{if(!disposed) setError('Unable to resume automatically. Join again to retry.');}).finally(()=>{if(!disposed) setBusy(false);});
    },0);
    return()=>{disposed=true;clearTimeout(initial);};
  },[id,canResume]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${id}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.status === 410) { setEnded(true); setSession(null); return; }
      if (!response.ok) {
        if (response.status === 404) setFatal(result.error);
        else setLoadError(result.error);
        return;
      }
      setInfo(result);
      setLoadError('');
    } catch { setLoadError('Connection interrupted. Checking again shortly…'); }
  }, [id]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 5000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [load]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    knockedOut.current = false;
    try {
      const name=info?.isHost ? info.hostName : nickname;
      let resumeSession;
      try { resumeSession=JSON.parse(sessionStorage.getItem(storageKey) || 'null')?.session; } catch {}
      const next=await api(`/api/rooms/${id}/token`, { nickname:name,resumeSession });
      try { sessionStorage.setItem(storageKey,JSON.stringify({session:next.musicSession,nickname:name})); } catch {}
      setSession(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to join.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader><InviteButton /></SiteHeader>

      {ended || fatal ? (
        <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-secondary text-primary"><Radio /></span>
          <h1 className="text-3xl font-medium tracking-tight">{ended ? 'That’s a wrap.' : 'Room unavailable'}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{ended ? 'This study room has ended. Thanks for showing up.' : fatal}</p>
          {ended && info?.isHost && <>
            <Button variant="outline" disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try { await api(`/api/rooms/${id}/end`); setError('Media cleanup completed.'); }
              catch (e) { setError(e instanceof Error ? e.message : 'Cleanup failed. Try again.'); }
              finally { setBusy(false); }
            }}>{busy ? 'Closing media session…' : 'Retry media cleanup'}</Button>
            <p className="text-xs text-muted-foreground">Use this if the media session did not finish closing.</p>
            {error && <p className="text-sm text-muted-foreground" role="status">{error}</p>}
          </>}
          <Button asChild><Link href="/explore">Explore Rooms <ArrowRight /></Link></Button>
        </main>
      ) : !info ? (
        <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
          {loadError ? <><p className="text-sm text-destructive" role="alert">{loadError}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></> : <><LoaderCircle className="size-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Finding your room…</p></>}
        </main>
      ) : (
        <>
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-7 sm:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{info.isHost ? 'YOUR STUDY SPACE' : 'SETTLE IN & STAY AWHILE'}</p>
              <h1 className="mt-2 break-words text-2xl font-medium tracking-tight sm:text-3xl">{info.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Hosted by {info.hostName}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-2 text-[10px] tracking-wider text-muted-foreground">
              <span className={`size-2 rounded-full ${info.state === 'LIVE' ? 'bg-primary' : 'bg-muted-foreground'}`} />
              {info.status ?? (info.state === 'LIVE' ? 'LIVE' : 'OPEN')}
            </span>
          </div>

          {!session ? (
            <Card className="mx-auto mb-12 w-[calc(100%-2rem)] max-w-lg border-border/80 bg-card/80 shadow-xl">
              <CardContent className="flex flex-col items-center gap-5 pt-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Radio /></span>
                <div><h2 className="text-2xl font-medium tracking-tight">{info.isHost ? 'Your space is ready.' : 'A little company awaits.'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{info.isHost ? 'Join your study room, then turn on any devices you want to share.' : 'Choose a nickname to study, share, and chat together. Up to 6 people can join.'}</p></div>
                <form className="w-full space-y-4 text-left" onSubmit={join}>
                  {!info.isHost && <div className="space-y-2"><Label htmlFor="viewer-name">Your nickname</Label><Input id="viewer-name" value={nickname} onChange={event => setNickname(event.target.value)} maxLength={32} required autoComplete="nickname" placeholder="What should we call you?" /></div>}
                  <fieldset className="space-y-2"><legend className="text-sm font-medium">Choose your room view</legend><div className="grid gap-2 sm:grid-cols-2">{(['grid', 'first-person'] as const).map(option => <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm"><input type="radio" name="room-view" checked={view === option} onChange={() => setView(option)} />{option === 'grid' ? 'Grid view' : 'First-person view'}</label>)}</div><p className="text-xs text-muted-foreground">Switch views at any time. In this room, a nearby standing participant can punch a seated participant out; removed participants can rejoin.</p></fieldset>
                  <Button className="w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <>{info.isHost ? 'Enter room' : 'Join study room'} <ArrowRight /></>}</Button>
                </form>
                {(error || loadError) && <p className="w-full rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200" role="alert">{error || loadError}</p>}
              </CardContent>
            </Card>
          ) : (
            <LiveKitRoom token={session.token} serverUrl={session.serverUrl} connect audio={false} video={false}
              onError={() => { setSession(null); setError('Unable to connect. Rooms allow up to 6 participants. Check your connection; if the room is full, wait for someone to leave and try again.'); }}
              onDisconnected={reason => { if(knockedOut.current || reason===DisconnectReason.PARTICIPANT_REMOVED) forgetVisit(); setSession(null); setError(current => current || (knockedOut.current ? 'You were punched out of your chair and removed from the room. You can rejoin while it is open.' : reason === DisconnectReason.PARTICIPANT_REMOVED ? 'You were removed from this room. You can rejoin while it is open.' : 'You disconnected. You can rejoin while the room is active.')); }}>
              <Studio info={{ ...info, isHost: session.isHost }} musicSession={session.musicSession} view={view} onViewChange={setView} onKnockedOut={() => { knockedOut.current = true; }} onLeave={() => { forgetVisit();setSession(null); setError('You left the room. You can rejoin while it is open.'); }} onEnded={() => { forgetVisit();setEnded(true); setSession(null); }} />
              {(error || loadError) && <div className="mx-auto my-4 max-w-7xl px-5 text-sm text-destructive" role="alert">{error || loadError}</div>}
            </LiveKitRoom>
          )}
        </>
      )}
    </div>
  );
}
