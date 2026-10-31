import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { body, fail, json, limit, sameOrigin } from "@/lib/http";
import { HttpError, roomId, text } from "@/lib/validation";
import { getRecord, transition } from "@/lib/room-store";
import { hostCookie, isHost } from "@/lib/auth";
import { ensureStudyRoom, issueToken, livekitRoom, MAX_PARTICIPANTS, roomService } from "@/lib/livekit";
import { configuration } from "@/lib/config";
import { musicSession, verifyMusicSession } from "@/lib/music-session";
import { attendanceState } from "@/lib/attendance-store";
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
    const participants = await roomService().listParticipants(livekitRoom(id));
    let resumeIdentity = '';
    if (typeof input.resumeSession === 'string') {
      let candidate = '';
      try { candidate = verifyMusicSession(input.resumeSession, id); } catch { /* Expired credentials start a new visit. */ }
      if (candidate) {
        const {snapshot} = await attendanceState(id);
        const visit = snapshot.participants.find(p => p.participantId === candidate);
        if (visit && visit.status !== 'LEFT' && (visit.status === 'CONNECTED' || snapshot.serverNow - visit.disconnectedAt <= 30000)) resumeIdentity = candidate;
      }
    }
    if (new Set(participants.filter(p => p.identity !== resumeIdentity).map(participant => participant.identity)).size >= MAX_PARTICIPANTS)
      throw new HttpError(409, "This study room is full. Wait for someone to leave and try again.");
    const host = isHost(
      request.cookies.get(hostCookie(id))?.value,
      room.hostHash,
    );
    if (room.state === "CREATED") await transition(id, "LIVE");
    const identity = resumeIdentity || `participant-${randomUUID()}`;
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
