'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { spotifyEmbed } from '@/lib/external-music';
import type { MusicProvider, MusicSearchResult } from '@/lib/music-search-types';

export function SongArtwork({src}: {src?: string | null}) {
  // Provider artwork is displayed directly, without cropping or a server image proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" width={96} height={72} loading="lazy" referrerPolicy="no-referrer" className="h-18 w-24 shrink-0 rounded object-contain" /> : <span aria-hidden="true" className="flex h-18 w-24 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">No artwork</span>;
}

export function MusicSourceBrowser({id, session, connected, busy, unavailableYouTubeIds, onYouTubeRequest, onSpotifyOpen}: {
  id: string; session: string; connected: boolean; busy: boolean; unavailableYouTubeIds: string[];
  onYouTubeRequest: (url: string) => void; onSpotifyOpen: (embed: string) => void;
}) {
  const [provider, setProvider] = useState<MusicProvider>('youtube');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function cancelSearch() {
    request.current?.abort(); request.current = null;
    setLoading(false); setSearched(false); setResults([]); setError('');
  }
  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setResults([]); setError(''); setSearched(false);
    try {
      const params = new URLSearchParams({provider, q: query.trim()});
      const response = await fetch(`/api/rooms/${id}/music/search?${params}`, {
        cache: 'no-store', signal: controller.signal, headers: {Authorization: `Bearer ${session}`},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search is unavailable. Try again.');
      if (!controller.signal.aborted) { setResults(data.results); setSearched(true); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Search is unavailable.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function select(value: string) {
    if (provider === 'youtube') { onYouTubeRequest(value); return; }
    const embed = spotifyEmbed(value);
    if (embed) { onSpotifyOpen(embed); setError(''); }
    else setError('Use an HTTPS open.spotify.com track, album, playlist or episode link.');
  }

  return <section className="space-y-3 rounded-md border border-border p-3" aria-label="Search external music">
    <Label htmlFor={`music-source-${id}`}>Choose a music source</Label>
    <select id={`music-source-${id}`} value={provider} onChange={event => { cancelSearch(); setProvider(event.target.value as MusicProvider); setUrl(''); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      <option value="youtube">YouTube — shared queue</option><option value="spotify">Spotify — personal player</option>
    </select>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
      <Label htmlFor={`provider-search-${id}`} className="sr-only">Song title or artist</Label>
      <Input id={`provider-search-${id}`} type="search" minLength={2} maxLength={100} required placeholder="Song title or artist…" value={query} onChange={event => { cancelSearch(); setQuery(event.target.value); }} />
      <Button size="sm" disabled={!connected || loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Search'}</Button>
    </form>
    <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{loading ? `Searching ${provider === 'youtube' ? 'YouTube' : 'Spotify'}…` : searched ? results.length ? `${results.length} results` : 'No songs found. Try a different title or artist.' : 'Enter a song title or artist, then press Search.'}</div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {results.length > 0 && <ul className="max-h-96 space-y-3 overflow-auto">{results.map(result => <li key={result.id} className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-3"><SongArtwork src={result.thumbnail} /><div className="min-w-0"><p className="break-words text-sm font-medium">{result.title}</p><p className="text-xs text-muted-foreground">{result.artist}</p><a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">View on {result.provider === 'youtube' ? 'YouTube' : 'Spotify'}</a></div></div>
      <Button size="sm" variant="outline" disabled={!connected || busy || (provider === 'youtube' && unavailableYouTubeIds.includes(`youtube:${result.id}`))} onClick={() => select(result.url)}>{provider === 'youtube' ? unavailableYouTubeIds.includes(`youtube:${result.id}`) ? 'Already in room music' : 'Request song' : 'Open Spotify player'}</Button>
    </li>)}</ul>}
    <details><summary className="cursor-pointer text-xs font-medium">Or paste a link</summary><form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); select(url); }}>
      <Input aria-label="YouTube or Spotify link" type="url" required maxLength={2048} placeholder={provider === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://open.spotify.com/track/…'} value={url} onChange={event => setUrl(event.target.value)} />
      <Button size="sm" variant="outline" disabled={!connected || busy}>{provider === 'youtube' ? 'Request YouTube video' : 'Open Spotify player'}</Button>
    </form></details>
    <p className="text-xs leading-5 text-muted-foreground">{provider === 'youtube' ? 'Uses the official visible YouTube player. Some videos cannot be embedded. The creator must stay connected with music enabled for automatic next video.' : 'Spotify plays only for you using its own controls. Preview length, login and availability depend on Spotify. It does not join the synchronized room queue.'}</p>
  </section>;
}
