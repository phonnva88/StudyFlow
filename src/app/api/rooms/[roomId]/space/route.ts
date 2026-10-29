import type { NextRequest } from 'next/server';
import { roomSpaceEndpoint } from '@/lib/room-space-api';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: {params: Promise<{roomId: string}>}) {
  return roomSpaceEndpoint(request, (await context.params).roomId);
}
export async function POST(request: NextRequest, context: {params: Promise<{roomId: string}>}) {
  return roomSpaceEndpoint(request, (await context.params).roomId, true);
}
