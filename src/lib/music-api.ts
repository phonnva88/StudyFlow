import type { NextRequest } from 'next/server';
import { authorized, body, fail, json, sameOrigin } from './http';
import { getRecord, rateLimit } from './room-store';
import { HttpError, roomId } from './validation';
import { verifyMusicSession } from './music-session';
import { roomService, livekitRoom } from './livekit';
import { requestedTrack, updateMusic } from './music-store';
import { DataPacket_Kind } from 'livekit-server-sdk';

export async function musicEndpoint(request: NextRequest, rawId: string, action = 'snapshot', requestId?: string) {
  try {
    const id = roomId(rawId);
    if (action !== 'snapshot') sameOrigin(request);
    await getRecord(id);
    const identity = verifyMusicSession(request.headers.get('authorization')?.replace(/^Bearer /, '') || '', id);
    const service = roomService();
    let participant;
    try { participant = await service.getParticipant(livekitRoom(id), identity); }
    catch { throw new HttpError(403, 'Connect to this room to use its music player.'); }
    await rateLimit(`music-read:${id}:${identity}`, 90, 60);
    let data: Record<string, unknown> = {};
    if (action === 'request') {
      await rateLimit(`music-request:${id}:${identity}`, 5, 60);
      data = requestedTrack((await body(request)).trackId, participant.name || 'Guest');
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
