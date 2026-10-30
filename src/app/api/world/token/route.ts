import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { AccessToken, RoomConfiguration } from 'livekit-server-sdk';
import { body, fail, json, limit, sameOrigin } from '@/lib/http';
import { configuration } from '@/lib/config';
import { roomService } from '@/lib/livekit';
import { HttpError, text } from '@/lib/validation';
import { AVATAR_COLORS, WORLD_CAPACITY, WORLD_ROOM } from '@/lib/world';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const input = await body(request);
    const nickname = text(input.nickname, 'Nickname', 32);
    if (!AVATAR_COLORS.some(c => c === input.avatarColor)) throw new HttpError(400, 'Choose an available avatar color.');
    await limit(request, 'world-join', 10);
    const service = roomService();
    const roomConfig = {maxParticipants: WORLD_CAPACITY, emptyTimeout: 300, departureTimeout: 60};
    const room = await service.createRoom({name: WORLD_ROOM, ...roomConfig});
    if (room.maxParticipants !== WORLD_CAPACITY) throw new HttpError(503, 'The world configuration needs an update. Please try again later.');
    if ((await service.listParticipants(WORLD_ROOM)).length >= WORLD_CAPACITY) throw new HttpError(409, 'The library is full. You can still browse Explore Rooms.');
    const c = configuration();
    const identity = `world-${randomUUID()}`;
    const token = new AccessToken(c.key, c.secret, {identity, name: nickname, ttl: 60, metadata: JSON.stringify({worldAvatar: input.avatarColor})});
    token.roomConfig = new RoomConfiguration(roomConfig);
    token.addGrant({roomJoin: true, room: WORLD_ROOM, canPublish: false, canSubscribe: false, canPublishData: true, canUpdateOwnMetadata: false});
    return json({token: await token.toJwt(), serverUrl: c.url});
  } catch (error) { return fail(error); }
}
