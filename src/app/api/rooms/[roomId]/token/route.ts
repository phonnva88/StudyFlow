import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { body, fail, json, limit, sameOrigin } from "@/lib/http";
import { HttpError, roomId, text } from "@/lib/validation";
import { getRecord, transition } from "@/lib/room-store";
import { hostCookie, isHost } from "@/lib/auth";
import { ensureStudyRoom, issueToken, roomService, livekitRoom, MAX_PARTICIPANTS } from "@/lib/livekit";
import { configuration } from "@/lib/config";
import { musicSession } from "@/lib/music-session";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    sameOrigin(request);
    const id = roomId((await context.params).roomId);
    const input = await body(request);
    const nickname = text(input.nickname, "Nickname", 32);
    await limit(request, "join", 40);
    const room = await getRecord(id);
    await ensureStudyRoom(id);
    // Preflight gives a useful error; LiveKit admission remains authoritative
    // for the race where several users connect with freshly issued tokens.
    if ((await roomService().listParticipants(livekitRoom(id))).length >= MAX_PARTICIPANTS)
      throw new HttpError(409, "This study room is full (6 participants). Please try again after someone leaves.");
    const host = isHost(
      request.cookies.get(hostCookie(id))?.value,
      room.hostHash,
    );
    if (room.state === "CREATED") await transition(id, "LIVE");
    const identity = `participant-${randomUUID()}`;
    const token = await issueToken(
      id,
      host ? room.hostName : nickname,
      host,
      identity,
    );
    // Fail closed if an end action raced token creation.
    await getRecord(id);
    return json({ token, serverUrl: configuration().url, isHost: host, musicSession: musicSession(id, identity, room.expiresAt) });
  } catch (error) {
    return fail(error);
  }
}
