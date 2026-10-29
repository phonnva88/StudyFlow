'use client';

import { useEffect, useRef, useState } from 'react';
import type { WorldBridge } from '@/lib/world-bridge';

export default function WorldCanvas({bridge}: {bridge: WorldBridge}) {
  const parent = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let game: import('phaser').Game | undefined;
    void import('./world-scene').then(({createLibrary}) => { if (!disposed && parent.current) game = createLibrary(parent.current, bridge); }).catch(() => { if (!disposed) setError('The library canvas could not load. Use the room list below or reload to try again.'); });
    return () => { disposed = true; game?.destroy(true); };
  }, [bridge]);
  return <div className="space-y-2">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div ref={parent} className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-[#302e31]" /></div>;
}
