import type { MusicState } from './music-types';

// elapsedMs is measured on the local monotonic clock, from the request midpoint.
export function musicPosition(state: MusicState, elapsedMs: number): number {
  const elapsed = state.status === 'PLAYING' && state.startedAt !== null
    ? Math.max(0, (state.serverNow - state.startedAt + elapsedMs) / 1000) : 0;
  if (!state.current) return 0;
  return state.current.track?.provider === 'youtube' ? state.positionSeconds + elapsed : Math.min(state.current.durationSeconds, state.positionSeconds + elapsed);
}
