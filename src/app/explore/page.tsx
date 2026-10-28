'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Search } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Navigation } from '@/components/navigation';
import { RoomCard } from '@/components/room-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { DiscoveryRoom } from '@/lib/discovery-types';

export default function Explore() {
  const [rooms, setRooms] = useState<DiscoveryRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('NEWEST');
  const pending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (pending.current) return;
    pending.current = true;
    try {
      const response = await fetch('/api/rooms', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load rooms.');
      if (!signal?.aborted) { setRooms(data.rooms); setError(''); }
    } catch (e) {
      if (!signal?.aborted) { setError(e instanceof Error ? e.message : 'Unable to load rooms.'); setRooms([]); }
    } finally { pending.current = false; if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load(controller.signal), 0);
    const poll = setInterval(() => void load(controller.signal), 12000);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(poll); };
  }, [load]);
  const visible = rooms.filter(room =>
    room.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (filter === 'ALL' || (filter === 'AVAILABLE' ? room.status !== 'FULL' : room.status === filter)))
    .sort((a, b) => sort === 'MOST' ? b.participantCount - a.participantCount || b.createdAt - a.createdAt : sort === 'LEAST' ? a.participantCount - b.participantCount || b.createdAt - a.createdAt : b.createdAt - a.createdAt);
  return <div className="min-h-screen">
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-6"><Brand /><Navigation /></header>
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Find your study company.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Explore public rooms and study together. Cameras and microphones start off. Counts refresh every 12 seconds.</p>
      <div className="my-8 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="space-y-2"><Label htmlFor="room-search"><Search className="size-4" />Search rooms</Label><Input id="room-search" placeholder="Search by room title…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="room-filter">Show</Label><select id="room-filter" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="ALL">All Rooms</option><option value="ACTIVE">Active</option><option value="EMPTY">Empty</option><option value="AVAILABLE">Available (not full)</option></select></div>
        <div className="space-y-2"><Label htmlFor="room-sort">Sort by</Label><select id="room-sort" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={sort} onChange={event => setSort(event.target.value)}><option value="NEWEST">Newest first</option><option value="MOST">Most participants</option><option value="LEAST">Least participants</option></select></div>
      </div>
      {loading ? <p role="status" className="flex items-center gap-2 py-12 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Finding study rooms…</p> : error ? <div role="alert" className="space-y-4 rounded-xl border border-destructive/40 p-6"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div> : !rooms.length ? <div className="space-y-4 rounded-xl border border-border p-10 text-center"><h2 className="text-xl">A quiet moment. Start something good.</h2><p className="text-sm text-muted-foreground">There are no public rooms yet. Create one and welcome some company.</p><Button asChild><Link href="/#create-room">Create Room</Link></Button></div> : !visible.length ? <p role="status" className="py-12 text-center text-muted-foreground">No matching rooms. Try another title or filter.</p> : <div aria-label="Public study rooms" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.map(room => <RoomCard key={room.id} room={room} />)}</div>}
    </main>
  </div>;
}
