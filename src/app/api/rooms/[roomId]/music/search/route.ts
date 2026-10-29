import type { NextRequest } from 'next/server';
import { musicSearchEndpoint } from '@/lib/music-api';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  return musicSearchEndpoint(request, (await context.params).roomId);
}
