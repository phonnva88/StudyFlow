import { NextRequest } from "next/server";
import { fail, json } from "@/lib/http";
import { roomId } from "@/lib/validation";
import { getRecord, publicRoom } from "@/lib/room-store";
import { hostCookie, isHost } from "@/lib/auth";
import { discoverRooms } from "@/lib/room-discovery";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const id = roomId((await context.params).roomId);
    const room = await getRecord(id);
    return json({
      ...publicRoom(room),
      ...(await discoverRooms([room]))[0],
      isHost: isHost(request.cookies.get(hostCookie(id))?.value, room.hostHash),
    });
  } catch (error) {
    return fail(error);
  }
}
