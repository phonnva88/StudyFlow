import type { NextRequest } from 'next/server';
import { musicEndpoint } from '@/lib/music-api';
export const runtime = 'nodejs';
export async function DELETE(request: NextRequest, context: {params: Promise<{roomId: string; requestId: string}>}) {
  const {roomId, requestId} = await context.params;
  return musicEndpoint(request, roomId, 'remove', requestId);
}
