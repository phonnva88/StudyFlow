import type { NextRequest } from 'next/server';
import { musicEndpoint } from '@/lib/music-api';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: {params: Promise<{roomId: string}>}) {
  return musicEndpoint(request, (await context.params).roomId);
}
