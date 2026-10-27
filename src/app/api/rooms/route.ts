import { NextRequest } from "next/server";
import {
  newRoomId,
  newHostCredential,
  hashCredential,
  hostCookie,
} from "@/lib/auth";
import { body, fail, json, limit, sameOrigin } from "@/lib/http";
import { HttpError, text } from "@/lib/validation";
import { createRecord, listPublicRecords, ROOM_TTL } from "@/lib/room-store";
import { discoverRooms } from "@/lib/room-discovery";
import { ensureStudyRoom, livekitRoom, roomService } from "@/lib/livekit";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    await limit(request, "discovery", 30);
    const rooms = await discoverRooms(await listPublicRecords());
    return json({ rooms: rooms.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)) });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const input = await body(request);
    const hostName = text(input.nickname, "Nickname", 32);
    const title = text(input.title, "Room title", 80);
    const visibility = input.visibility ?? "PUBLIC";
    if (visibility !== "PUBLIC" && visibility !== "PRIVATE")
      throw new HttpError(400, "Choose public or invite-only room visibility.");
    await limit(request, "create", 5);
    const id = newRoomId();
    const credential = newHostCredential();
    const service = roomService();
    await ensureStudyRoom(id);
    try {
      await createRecord({
        id,
        title,
        hostName,
        hostHash: hashCredential(credential),
        state: "CREATED",
        visibility,
        createdAt: Date.now(),
        expiresAt: Date.now() + ROOM_TTL * 1000,
      });
    } catch (error) {
      await service.deleteRoom(livekitRoom(id)).catch(() => {});
      throw error;
    }
    const response = json({ id, url: `/room/${id}` }, 201);
    response.cookies.set(hostCookie(id), credential, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: `/api/rooms/${id}`,
      maxAge: ROOM_TTL,
    });
    return response;
  } catch (error) {
    return fail(error);
  }
}
