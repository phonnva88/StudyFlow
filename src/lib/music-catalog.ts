import type { MusicTrack } from './music-types';

// Original synthesized compositions. No third-party recordings or samples.
// Add only reviewed, authorized assets; URLs are never accepted from clients.
export const musicTracks: MusicTrack[] = [
  { id: 'quiet-orbit', title: 'Quiet Orbit', artist: 'StudyFlow', durationSeconds: 45, audioUrl: '/music/quiet-orbit.wav', licenseInfo: 'Original procedural composition for StudyFlow; CC0-1.0. Source: scripts/render-study-music.mjs; attribution: public/music/LICENSE.md' },
  { id: 'soft-morning', title: 'Soft Morning', artist: 'StudyFlow', durationSeconds: 45, audioUrl: '/music/soft-morning.wav', licenseInfo: 'Original procedural composition for StudyFlow; CC0-1.0. Source: scripts/render-study-music.mjs; attribution: public/music/LICENSE.md' },
];
