'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function CreateRoomForm({nickname = '', id = 'create-room'}: {nickname?: string; id?: string}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/rooms', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({nickname: data.get('nickname'), title: data.get('title'), visibility: data.get('visibility')})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create a room.');
      router.push(`/room/${result.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create a room. Please try again.'); setBusy(false); }
  }
  return <form id={id} className="mt-5 space-y-5" onSubmit={create}>
    <div className="space-y-2"><Label htmlFor={`${id}-nickname`}>Your nickname</Label><Input id={`${id}-nickname`} name="nickname" defaultValue={nickname} placeholder="What should we call you?" autoComplete="nickname" required maxLength={32} disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor={`${id}-title`}>Room title</Label><Input id={`${id}-title`} name="title" placeholder="e.g. Late-night library hours" required maxLength={80} disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor={`${id}-visibility`}>Who can discover your room?</Label><select id={`${id}-visibility`} name="visibility" defaultValue="PUBLIC" disabled={busy} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="PUBLIC">Public — visible in Explore</option><option value="PRIVATE">Invite-only — anyone with your link</option></select><p className="text-xs text-muted-foreground">Public rooms welcome everyone. Invite-only rooms stay unlisted; share their link only with your study people.</p></div>
    {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200" role="alert">{error}</p>}
    <Button className="w-full justify-between" disabled={busy}>{busy ? <><LoaderCircle className="size-4 animate-spin" />Creating your room…</> : <>Create Room <ArrowRight className="size-4" /></>}</Button>
  </form>;
}
