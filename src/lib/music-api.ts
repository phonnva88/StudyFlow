import type { NextRequest } from 'next/server';
import { authorized, body, fail, json, sameOrigin } from './http';
import { getRecord, rateLimit } from './room-store';
import { HttpError, roomId } from './validation';
import { verifyMusicSession } from './music-session';
import { roomService, livekitRoom } from './livekit';
import { requestedTrack, updateMusic } from './music-store';
import { DataPacket_Kind } from 'livekit-server-sdk';
import { searchInput, searchMusic, youtubeDetails } from './music-search';

export async function musicAccess(request: NextRequest, rawId: string) {
  const id = roomId(rawId);
  await getRecord(id);
  const identity = verifyMusicSession(request.headers.get('authorization')?.replace(/^Bearer /, '') || '', id);
  const service = roomService();
  let participant;
  try { participant = await service.getParticipant(livekitRoom(id), identity); }
  catch { throw new HttpError(403, 'Connect to this room to use its music player.'); }
  return {id, identity, service, participant};
}

export async function musicSearchEndpoint(request: NextRequest, rawId: string) {
  try {
    const {id, identity} = await musicAccess(request, rawId);
    const {provider, query} = searchInput(request.nextUrl.searchParams.get('provider'), request.nextUrl.searchParams.get('q'));
    await rateLimit(`music-search:${id}:${identity}`, 5, 60);
    await rateLimit(`music-search-room:${id}`, 20, 60);
    // search.list costs 100 units; reserve part of the default daily quota for metadata.
    if (provider === 'youtube' && process.env.YOUTUBE_API_KEY?.trim()) await rateLimit('music-search-youtube-daily', 80, 86400);
    return json({results: await searchMusic(provider, query)});
  } catch (error) { return fail(error); }
}

export async function musicEndpoint(request: NextRequest, rawId: string, action = 'snapshot', requestId?: string) {
  try {
    if (action !== 'snapshot') sameOrigin(request);
    const {id, identity, service, participant} = await musicAccess(request, rawId);
    await rateLimit(`music-read:${id}:${identity}`, 90, 60);
    let data: Record<string, unknown> = {};
    if (action === 'request') {
      await rateLimit(`music-request:${id}:${identity}`, 5, 60);
      const input = await body(request);
      data = requestedTrack(input.trackId, participant.name || 'Guest', input.url);
      const track = data.track as import('./music-types').MusicTrack | undefined;
      if (track?.provider === 'youtube' && track.externalId && process.env.YOUTUBE_API_KEY?.trim()) {
        data.track = await youtubeDetails(track.externalId);
      }
    } else if (action !== 'snapshot') {
      await authorized(request, id);
      await rateLimit(`music-control:${id}`, 30, 60);
      if (action === 'remove') {
        if (!requestId || !/^[a-f0-9-]{36}$/.test(requestId)) throw new HttpError(400, 'Invalid queue item.');
        data = { id: requestId };
      } else {
        if (!['play', 'pause', 'skip'].includes(action)) throw new HttpError(404, 'Music action not found.');
        const input = await body(request);
        if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) throw new HttpError(400, 'A playback version is required.');
        data = { expectedVersion: input.expectedVersion };
      }
    }
    const state = await updateMusic(id, action, data);
    if (action !== 'snapshot' || (state as typeof state & {changed?: boolean}).changed) {
      // Notifications are hints only. Clients always fetch the authoritative snapshot.
      await service.sendData(livekitRoom(id), new TextEncoder().encode(JSON.stringify({version: state.version})), DataPacket_Kind.RELIABLE, {topic: 'studyflow.music.changed'}).catch(() => {});
    }
    return json(state);
  } catch (error) { return fail(error); }
}
