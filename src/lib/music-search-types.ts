export type MusicProvider = 'youtube' | 'spotify';
export interface MusicSearchResult {
  id: string;
  provider: MusicProvider;
  title: string;
  artist: string;
  thumbnail: string | null;
  url: string;
}
