import { NextRequest } from "next/server";
import { authorized, fail, json, sameOrigin } from "@/lib/http";
import { transition } from "@/lib/room-store";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    sameOrigin(request);
    const room = await authorized(request, (await context.params).roomId);
    await transition(room.id, "LIVE");
    return json({ state: "LIVE" });
  } catch (error) {
    return fail(error);
  }
}
