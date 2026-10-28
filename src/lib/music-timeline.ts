import type { MusicState } from './music-types';

// elapsedMs is measured on the local monotonic clock, from the request midpoint.
export function musicPosition(state: MusicState, elapsedMs: number): number {
  const elapsed = state.status === 'PLAYING' && state.startedAt !== null
    ? Math.max(0, (state.serverNow - state.startedAt + elapsedMs) / 1000) : 0;
  return Math.min(state.current?.durationSeconds || 0, state.positionSeconds + elapsed);
}
