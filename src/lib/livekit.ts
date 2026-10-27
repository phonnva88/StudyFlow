import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { configuration } from "./config";
export const TOKEN_TTL = 15;
export const livekitRoom = (id: string) => `studyflow-${id}`;
export function roomService() {
  const c = configuration();
  return new RoomServiceClient(
    c.url.replace("wss://", "https://"),
    c.key,
    c.secret,
  );
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
    metadata: JSON.stringify({ role: host ? "host" : "viewer" }),
  });
  token.addGrant({
    roomJoin: true,
    room: livekitRoom(id),
    canSubscribe: true,
    canPublish: host,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    ...(host
      ? {
          canPublishSources: [
            TrackSource.CAMERA,
            TrackSource.MICROPHONE,
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ],
        }
      : {}),
  });
  return token.toJwt();
}
