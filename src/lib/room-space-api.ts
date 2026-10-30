import type { NextRequest } from 'next/server';
import { DataPacket_Kind } from 'livekit-server-sdk';
import { body, fail, json, sameOrigin } from './http';
import { getRecord, rateLimit } from './room-store';
import { roomService, livekitRoom } from './livekit';
import { verifyMusicSession } from './music-session';
import { HttpError, roomId } from './validation';
import { updateRoomSpace } from './room-space-store';
import { roomSpaceCanStand, ROOM_SPACE_SEATS } from './room-space';

export async function roomSpaceEndpoint(request: NextRequest, rawId: string, write = false) {
  try {
    if (write) sameOrigin(request);
    const id = roomId(rawId);
    await getRecord(id);
    const identity = verifyMusicSession(request.headers.get('authorization')?.replace(/^Bearer /, '') || '', id);
    await rateLimit(`space:${id}:${identity}`, 420, 60);
    const service = roomService();
    const providerRoom = livekitRoom(id);
    let present;
    try { present = await service.listParticipants(providerRoom); }
    catch { throw new HttpError(503, 'Room presence is unavailable. Please try again.'); }
    if (!present.some(p => p.identity === identity)) throw new HttpError(403, 'Connect to this study room before interacting.');
    const members = present.filter(p => /^participant-[a-f0-9-]{36}$/.test(p.identity)).slice(0, 6).map(p => ({identity: p.identity, name: (p.name || 'Guest').slice(0, 32)}));
    let action = 'snapshot', input: Record<string, unknown> = {};
    if (write) {
      const value = await body(request);
      if (typeof value.action !== 'string' || !['move', 'sit', 'stand', 'punch'].includes(value.action)) throw new HttpError(400, 'Choose a valid room interaction.');
      action = value.action;
      if (action === 'move') {
        if (typeof value.x !== 'number' || typeof value.z !== 'number' || !roomSpaceCanStand(value.x, value.z) || typeof value.yaw !== 'number' || !Number.isFinite(value.yaw) || Math.abs(value.yaw) > Math.PI * 2) throw new HttpError(400, 'Use a valid position inside this room.');
        input = {x: value.x, z: value.z, yaw: value.yaw};
      } else if (action === 'sit') {
        if (!Number.isInteger(value.seat) || Number(value.seat) < 0 || Number(value.seat) >= ROOM_SPACE_SEATS.length) throw new HttpError(400, 'Choose an available chair.');
        input = {seat: value.seat};
      } else if (action === 'punch') {
        if (typeof value.target !== 'string' || !/^participant-[a-f0-9-]{36}$/.test(value.target)) throw new HttpError(400, 'Choose a connected participant.');
        if (value.target === identity) throw new HttpError(400, 'You cannot punch yourself.');
        input = {target: value.target};
      }
    }
    const snapshot = await updateRoomSpace(id, identity, members, action, input);
    if (snapshot.removedIdentity) {
      try {
        await service.sendData(providerRoom, new TextEncoder().encode(JSON.stringify({version: snapshot.version, removedIdentity: snapshot.removedIdentity})), DataPacket_Kind.RELIABLE, {topic: 'studyflow.space.changed', destinationIdentities: [snapshot.removedIdentity]}).catch(() => {});
        await service.removeParticipant(providerRoom, snapshot.removedIdentity, {revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1)});
      } catch {
        await updateRoomSpace(id, identity, members, 'rollback', {target: snapshot.removedIdentity, reservation: snapshot.reservation});
        throw new HttpError(503, 'The punch could not disconnect that participant. Please try again.');
      }
    }
    if (write && action !== 'move') await service.sendData(providerRoom, new TextEncoder().encode(JSON.stringify({version: snapshot.version, removedIdentity: snapshot.removedIdentity})), DataPacket_Kind.RELIABLE, {topic: 'studyflow.space.changed'}).catch(() => {});
    const {reservation: _reservation, ...publicSnapshot} = snapshot;
    void _reservation;
    return json(publicSnapshot);
  } catch (error) { return fail(error); }
}
