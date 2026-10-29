import { HttpError, text } from './validation';
import type { MusicProvider, MusicSearchResult } from './music-search-types';
import type { MusicTrack } from './music-types';

export function searchInput(provider: unknown, query: unknown) {
  if (provider !== 'youtube' && provider !== 'spotify') throw new HttpError(400, 'Choose YouTube or Spotify.');
  const q = text(query, 'Search', 100);
  if (q.length < 2) throw new HttpError(400, 'Enter at least two characters to search.');
  return { provider: provider as MusicProvider, query: q };
}

async function providerJson(url: string | URL, provider: string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) }); }
  catch { throw new HttpError(503, `${provider} could not be reached. Please try again.`); }
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, `${provider} is receiving too many requests. Try again later.`);
    if ([400, 401, 403].includes(response.status)) throw new HttpError(503, `${provider} API access is unavailable. Check the server credentials, API access and quota.`);
    throw new HttpError(503, `${provider} search is unavailable. Please try again.`);
  }
  try { return await response.json(); }
  catch { throw new HttpError(503, `${provider} returned an invalid response. Please try again.`); }
}

function youtubeKey() {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new HttpError(503, 'YouTube search needs YOUTUBE_API_KEY configured on the server.');
  return key;
}
interface YouTubeItem {
  id: string | { videoId?: string };
  snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
}
function youtubeResult(item: YouTubeItem): MusicSearchResult | null {
  const id = typeof item.id === 'string' ? item.id : item.id?.videoId;
  if (!id || !/^[\w-]{11}$/.test(id) || !item.snippet?.title) return null;
  return { id, provider: 'youtube', title: item.snippet.title, artist: item.snippet.channelTitle || 'YouTube',
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` };
}
export async function youtubeDetails(id: string): Promise<MusicTrack> {
  if (!/^[\w-]{11}$/.test(id)) throw new HttpError(400, 'Invalid YouTube video.');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search = new URLSearchParams({ part: 'snippet', id }).toString();
  const data = await providerJson(url, 'YouTube', { headers: { 'X-Goog-Api-Key': youtubeKey() } });
  const result = Array.isArray(data.items) && data.items[0] ? youtubeResult(data.items[0]) : null;
  if (!result) throw new HttpError(404, 'This YouTube video is no longer available.');
  return { id: `youtube:${id}`, provider: 'youtube', externalId: id, title: result.title, artist: result.artist,
    thumbnail: result.thumbnail || undefined, durationSeconds: 0, audioUrl: result.url,
    licenseInfo: 'Playback through the official YouTube player, subject to the video owner’s restrictions.' };
}

let tokenCache: { credentials: string; value: string; expiresAt: number } | undefined;
async function spotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim(), secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new HttpError(503, 'Spotify search needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET configured on the server.');
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  if (tokenCache?.credentials === credentials && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const data = await providerJson('https://accounts.spotify.com/api/token', 'Spotify', {
    method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new HttpError(503, 'Spotify authorization is unavailable.');
  tokenCache = { credentials, value: data.access_token, expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
  return data.access_token as string;
}
interface SpotifyTrack { id?: string; name?: string; artists?: {name: string}[]; album?: {images?: {url: string}[]} }
function spotifyResult(track: SpotifyTrack): MusicSearchResult | null {
  if (!track.id || !/^[A-Za-z0-9]{22}$/.test(track.id) || !track.name) return null;
  const thumbnail = track.album?.images?.[0]?.url;
  return { id: track.id, provider: 'spotify', title: track.name, artist: track.artists?.map(a => a.name).join(', ') || 'Spotify',
    thumbnail: thumbnail && /^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(thumbnail) ? thumbnail : null,
    url: `https://open.spotify.com/track/${track.id}` };
}
export async function searchMusic(provider: MusicProvider, query: string): Promise<MusicSearchResult[]> {
  if (provider === 'youtube') {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ part: 'snippet', type: 'video', q: query, maxResults: '10', videoEmbeddable: 'true', videoSyndicated: 'true' }).toString();
    const data = await providerJson(url, 'YouTube', { headers: { 'X-Goog-Api-Key': youtubeKey() } });
    if (!Array.isArray(data.items)) throw new HttpError(503, 'YouTube returned invalid search results.');
    return data.items.map(youtubeResult).filter((item: MusicSearchResult | null): item is MusicSearchResult => item !== null);
  }
  const url = new URL('https://api.spotify.com/v1/search');
  url.search = new URLSearchParams({ q: query, type: 'track', limit: '10' }).toString();
  const data = await providerJson(url, 'Spotify', { headers: { Authorization: `Bearer ${await spotifyToken()}` } });
  if (!Array.isArray(data.tracks?.items)) throw new HttpError(503, 'Spotify returned invalid search results.');
  return data.tracks.items.map(spotifyResult).filter((item: MusicSearchResult | null): item is MusicSearchResult => item !== null);
}
