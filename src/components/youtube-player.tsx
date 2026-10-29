'use client';
import { useEffect, useRef, useState } from 'react';

interface Player {
  destroy(): void; playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getPlayerState(): number; setVolume(volume: number): void; mute(): void; unMute(): void;
}
interface YouTubeAPI { Player: new (element: HTMLElement, options: object) => Player }
declare global { interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void } }
let ready: Promise<YouTubeAPI> | undefined;
function api() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ready) ready = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); if (window.YT) resolve(window.YT); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { ready = undefined; reject(new Error('YouTube could not load. Check content blockers and your connection.')); };
    document.head.appendChild(script);
  });
  return ready;
}
export function YouTubePlayer({ videoId, playing, volume, muted, getPosition, onEnded }: {videoId: string; playing: boolean; volume: number; muted: boolean; getPosition: () => number | null; onEnded: () => void}) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({playing, volume, muted, getPosition, onEnded});
  const [error, setError] = useState('');
  useEffect(() => { latest.current = {playing, volume, muted, getPosition, onEnded}; }, [playing, volume, muted, getPosition, onEnded]);
  useEffect(() => {
    let disposed = false, player: Player | undefined, connected = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const element = document.createElement('div'); container.current?.appendChild(element);
    void api().then(YT => {
      if (disposed) return;
      player = new YT.Player(element, {videoId, width: '100%', height: 220, playerVars: {playsinline: 1, origin: window.location.origin, controls: 1}, events: {
        onReady: () => { connected = true; },
        onStateChange: (event: {data: number}) => { if (event.data === 0) latest.current.onEnded(); },
        onAutoplayBlocked: () => setError('YouTube blocked autoplay. Press Play inside the YouTube player to enable sound.'),
        onError: () => setError('This video cannot play here. It may be private, unavailable, or embedding may be disabled. Ask the creator to skip it.'),
      }});
      timer = setInterval(() => {
        if (!player || !connected) return;
        const s = latest.current;
        player.setVolume(s.volume * 100); if (s.muted) player.mute(); else player.unMute();
        if (!s.playing) { player.pauseVideo(); return; }
        const position = s.getPosition();
        if (position === null) { player.pauseVideo(); return; }
        if (Math.abs(player.getCurrentTime() - position) > 2) player.seekTo(position, true);
        if (player.getPlayerState() !== 1 && player.getPlayerState() !== 3 && player.getPlayerState() !== 0) player.playVideo();
      }, 1000);
    }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; if (timer) clearInterval(timer); player?.destroy(); element.remove(); };
  }, [videoId]);
  return <div className="space-y-2"><div ref={container} className="min-h-[220px] w-full overflow-hidden rounded-md" />{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<p className="text-xs text-muted-foreground">If you cannot hear it, press Play in the YouTube player. The creator controls the shared timeline.</p></div>;
}
