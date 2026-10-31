import type { NextRequest } from 'next/server';
import { attendanceEndpoint } from '@/lib/attendance-api';
export const runtime='nodejs';
export async function POST(request:NextRequest, context:{params:Promise<{roomId:string}>}) { return attendanceEndpoint(request,(await context.params).roomId,'leave'); }
