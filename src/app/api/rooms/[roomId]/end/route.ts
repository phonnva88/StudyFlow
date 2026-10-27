import { setTimeout as delay } from "node:timers/promises";
import { NextRequest } from "next/server";
import { authorized, fail, json, sameOrigin } from "@/lib/http";
import { transition } from "@/lib/room-store";
import { livekitRoom, roomService, TOKEN_TTL } from "@/lib/livekit";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    sameOrigin(request);
    const room = await authorized(request, (await context.params).roomId, true);
    // Revoke application access FIRST. A failed provider cleanup can safely be retried.
    await transition(room.id, "ENDED");
    const service = roomService();
    const name = livekitRoom(room.id);
    async function disconnectParticipants() {
      if (!(await service.listRooms([name])).length) return;
      const participants = await service.listParticipants(name);
      await Promise.all(
        participants.map((p) =>
          service.removeParticipant(name, p.identity, {
            revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
          }),
        ),
      );
    }
    await disconnectParticipants();
    // Allow all pre-end, not-yet-used join tokens to expire before final deletion.
    // Without this drain, a valid roomJoin JWT can automatically recreate a room.
    await delay((TOKEN_TTL + 2) * 1000);
    await disconnectParticipants();
    if ((await service.listRooms([name])).length)
      await service.deleteRoom(name);
    return json({ state: "ENDED" });
  } catch (error) {
    return fail(error);
  }
}
