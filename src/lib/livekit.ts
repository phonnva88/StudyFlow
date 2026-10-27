import {
  AccessToken,
  RoomServiceClient,
  RoomConfiguration,
  TrackSource,
} from "livekit-server-sdk";
import { configuration } from "./config";
import { ROOM_TTL } from "./room-store";
import { HttpError } from "./validation";
export const TOKEN_TTL = 15;
export const MAX_PARTICIPANTS = 6;
export const livekitRoom = (id: string) => `studyflow-${id}`;
export function roomService() {
  const c = configuration();
  return new RoomServiceClient(
    c.url.replace("wss://", "https://"),
    c.key,
    c.secret,
  );
}
// LiveKit enforces this at admission, including simultaneous connections. A
// listParticipants length check alone would race. Reject legacy uncapped rooms.
export async function ensureStudyRoom(id: string) {
  const room = await roomService().createRoom({
    name: livekitRoom(id),
    emptyTimeout: ROOM_TTL,
    departureTimeout: ROOM_TTL,
    maxParticipants: MAX_PARTICIPANTS,
  });
  if (room.maxParticipants !== MAX_PARTICIPANTS)
    throw new HttpError(409, "This room uses an older configuration. Please create a new study room.");
  return room;
}
export async function issueToken(
  id: string,
  nickname: string,
  host: boolean,
  identity: string,
) {
  const c = configuration();
  const token = new AccessToken(c.key, c.secret, {
    identity,
    name: nickname,
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({ role: host ? "host" : "participant" }),
  });
  // Preserve the cap if LiveKit has to recreate an empty room from a join JWT.
  token.roomConfig = new RoomConfiguration({
    maxParticipants: MAX_PARTICIPANTS,
    emptyTimeout: ROOM_TTL,
    departureTimeout: ROOM_TTL,
  });
  token.addGrant({
    roomJoin: true,
    room: livekitRoom(id),
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
  });
  return token.toJwt();
}
