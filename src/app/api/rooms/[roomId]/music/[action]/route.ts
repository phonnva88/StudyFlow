import type { NextRequest } from 'next/server';
import { musicEndpoint } from '@/lib/music-api';
import { json } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: {params: Promise<{roomId: string; action: string}>}) {
  const {roomId, action} = await context.params;
  if (!['requests', 'play', 'pause', 'skip'].includes(action)) return json({error: 'Music action not found.'}, 404);
  return musicEndpoint(request, roomId, action === 'requests' ? 'request' : action);
}
