import { musicTracks } from '@/lib/music-catalog';
import { json } from '@/lib/http';
export function GET() { return json({ tracks: musicTracks }); }
