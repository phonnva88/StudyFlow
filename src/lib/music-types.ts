export interface MusicTrack {
  id: string; title: string; artist: string; durationSeconds: number;
  audioUrl: string; licenseInfo: string;
}
export interface MusicItem { id: string; trackId: string; requestedBy: string; requestedAt: number; durationSeconds: number }
export interface MusicState {
  current: MusicItem | null; queue: MusicItem[]; status: 'IDLE' | 'PLAYING' | 'PAUSED';
  positionSeconds: number; startedAt: number | null; version: number; serverNow: number;
}
