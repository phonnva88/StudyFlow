'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoaderCircle, Radio, RefreshCw, Search } from 'lucide-react';
import type { DiscoverableRoom } from '@/lib/discovery';
import { RoomCard } from '@/components/room-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const filters = ['All Rooms', 'Active', 'Empty', 'Available'] as const;
type Filter = typeof filters[number];

export function ExploreRooms() {
  const [rooms, setRooms] = useState<DiscoverableRoom[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All Rooms');
  const [sort, setSort] = useState('newest');
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function load() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/rooms', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load study rooms.');
        if (active) { setRooms(result.rooms); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Unable to refresh rooms. Check your connection and try again.');
      } finally {
        clearTimeout(timeout);
        if (active) {
          setNow(Date.now());
          timer = setTimeout(() => void load(), 12000);
        }
      }
    }
    void load();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [refresh]);

  // Hide expired cards even if the latest poll failed.
  const visible = (rooms ?? []).filter(room => room.expiresAt > now)
    .filter(room => room.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .filter(room => filter === 'All Rooms' || (filter === 'Active' ? room.participantCount > 0 : filter === 'Empty' ? room.status === 'EMPTY' : room.status !== 'FULL'))
    .sort((a, b) => (sort === 'most' ? b.participantCount - a.participantCount : sort === 'least' ? a.participantCount - b.participantCount : b.createdAt - a.createdAt) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const hasRooms = rooms?.some(room => room.expiresAt > now);

  return (
    <>
      <div className="my-8 space-y-5 rounded-xl border border-border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="room-search">Search rooms by title</Label>
            <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="room-search" type="search" className="pl-9" placeholder="Find your study space…" value={query} onChange={event => setQuery(event.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-sort">Sort rooms</Label>
            <select id="room-sort" value={sort} onChange={event => setSort(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-48">
              <option value="newest">Newest first</option><option value="most">Most participants</option><option value="least">Least participants</option>
            </select>
          </div>
        </div>
        <div role="group" aria-label="Filter rooms" className="flex flex-wrap gap-2">
          {filters.map(value => <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</Button>)}
        </div>
      </div>

      {error && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <div role="alert"><p className="text-sm text-red-200">{error}</p>{rooms && <p className="mt-1 text-xs text-muted-foreground">Showing the last known counts. Availability is checked again when you join.</p>}</div>
        <Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}><RefreshCw />Try again</Button>
      </div>}

      {rooms === null && !error ? <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />Finding study rooms…</div> : rooms !== null && <>
        <p role="status" aria-live="polite" className="mb-5 text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? 'room' : 'rooms'} · Counts refresh every 12 seconds</p>
        {visible.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.map(room => <RoomCard key={room.id} room={room} />)}</div> : <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Radio className="size-8 text-primary" />
          <h2 className="text-xl font-medium">{hasRooms ? 'No matching rooms' : 'A little company starts with you.'}</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{hasRooms ? 'Try a different title or filter to find a study room.' : 'There are no public study rooms right now. Create one and make room for someone to join.'}</p>
          {hasRooms ? <Button variant="outline" onClick={() => { setQuery(''); setFilter('All Rooms'); }}>Clear search and filters</Button> : <Button asChild><Link href="/#create-room">Create Room</Link></Button>}
        </div>}
      </>}
    </>
  );
}
