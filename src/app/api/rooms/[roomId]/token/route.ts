import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { body, fail, json, limit, sameOrigin } from "@/lib/http";
import { roomId, text } from "@/lib/validation";
import { getRecord } from "@/lib/room-store";
import { hostCookie, isHost } from "@/lib/auth";
import { issueToken } from "@/lib/livekit";
import { configuration } from "@/lib/config";
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
    const host = isHost(
      request.cookies.get(hostCookie(id))?.value,
      room.hostHash,
    );
    const token = await issueToken(
      id,
      host ? room.hostName : nickname,
      host,
      host ? `host-${id}` : `viewer-${randomUUID()}`,
    );
    // Fail closed if an end action raced token creation.
    await getRecord(id);
    return json({ token, serverUrl: configuration().url, isHost: host });
  } catch (error) {
    return fail(error);
  }
}
