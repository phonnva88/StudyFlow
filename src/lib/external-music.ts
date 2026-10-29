export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname) ? (url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : null) : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function spotifyEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([a-zA-Z0-9]{22})\/?$/);
    return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null;
  } catch { return null; }
}
