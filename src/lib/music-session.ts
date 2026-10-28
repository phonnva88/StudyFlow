import { createHmac, timingSafeEqual } from 'node:crypto';
import { configuration } from './config';
import { HttpError } from './validation';

function signature(payload: string) {
  return createHmac('sha256', configuration().secret).update(`studyflow-music-v1:${payload}`).digest('base64url');
}
export function musicSession(roomId: string, identity: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ roomId, identity, expiresAt })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function verifyMusicSession(token: string, roomId: string): string {
  try {
    if (token.length > 2048) throw new Error();
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra) throw new Error();
    const expected = Buffer.from(signature(payload)), actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.roomId !== roomId || data.expiresAt <= Date.now() || !/^participant-[a-f0-9-]{36}$/.test(data.identity)) throw new Error();
    return data.identity;
  } catch { throw new HttpError(403, 'Join this room before using its music player.'); }
}
