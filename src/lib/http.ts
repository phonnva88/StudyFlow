import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hostCookie, isHost } from "./auth";
import { getRecord, rateLimit } from "./room-store";
import { HttpError, roomId } from "./validation";
export const runtime = "nodejs";
export async function body(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Use JSON requests.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 4096)
    throw new HttpError(413, "Request is too large.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
  if (!origin || origin !== expectedOrigin)
    throw new HttpError(403, "A same-origin request is required.");
}
export async function limit(
  request: NextRequest,
  action: string,
  count: number,
) {
  // Vercel overwrites x-forwarded-for; use a global fallback outside a trusted proxy.
  const ip = process.env.VERCEL
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
  await rateLimit(
    `${action}:${createHash("sha256").update(ip).digest("hex").slice(0, 24)}`,
    count,
    60,
  );
}
export async function authorized(
  request: NextRequest,
  id: string,
  allowEnded = false,
) {
  const room = await getRecord(roomId(id), allowEnded);
  if (!isHost(request.cookies.get(hostCookie(id))?.value, room.hostHash))
    throw new HttpError(403, "Only the host can perform this action.");
  return room;
}
export function fail(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  // Never serialize SDK responses: they may include credentials or upstream details.
  console.error(
    "StudyFlow operation failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    {
      error:
        "The streaming service is temporarily unavailable. Please try again.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
