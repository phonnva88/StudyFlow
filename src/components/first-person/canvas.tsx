'use client';

import {useEffect, useRef, useState} from 'react';
import {Button} from '../ui/button';
import type {FirstPersonBridge, FirstPersonHandle, LibraryModelStatus} from './scene';

export default function FirstPersonCanvas({bridge, onModelStatus}: {bridge: FirstPersonBridge; onModelStatus?: (status: LibraryModelStatus) => void}) {
  const parent = useRef<HTMLDivElement>(null);
  const controls = useRef<FirstPersonHandle | null>(null);
  const callback = useRef(onModelStatus);
  const movement = useRef(new Set<string>());
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callback.current = onModelStatus; }, [onModelStatus]);
  useEffect(() => {
    let disposed = false, failed = false;
    let handle: FirstPersonHandle | undefined;
    const pressed = movement.current;
    const fail = (message: string) => { if (!disposed && !failed) { failed = true; setError(message); handle?.dispose(); controls.current = null; } };
    const timeout = setTimeout(() => fail('The 3D library is taking too long to open. Reload it or switch to the grid.'), 15000);
    void import('./scene').then(({createFirstPerson}) => {
      if (!disposed && !failed && parent.current) {
        handle = createFirstPerson(parent.current, bridge, () => { if (!disposed && !failed) { clearTimeout(timeout); setReady(true); } }, message => { clearTimeout(timeout); fail(message); }, status => { if (!disposed && !failed) callback.current?.(status); });
        controls.current = handle;
      }
    }).catch(error => { clearTimeout(timeout); fail(error instanceof Error ? error.message : 'Unable to open the 3D library. Try the grid view.'); });
    return () => { disposed = true; clearTimeout(timeout); handle?.dispose(); controls.current = null; pressed.clear(); };
  }, [bridge, attempt]);
  function move(key: string, down: boolean) {
    if (down) movement.current.add(key); else movement.current.delete(key);
    controls.current?.setMove(Number(movement.current.has('up')) - Number(movement.current.has('down')), Number(movement.current.has('right')) - Number(movement.current.has('left')));
  }
  const moveButton = (key: string, label: string, icon: string) => <Button variant="outline" size="sm" aria-label={label} className="touch-none select-none" onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(key, true); }} onPointerUp={() => move(key, false)} onPointerCancel={() => move(key, false)} onLostPointerCapture={() => move(key, false)}>{icon}</Button>;
  return <div className="space-y-3">
    {error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 bg-card p-4"><p className="text-sm">{error}</p><Button variant="outline" onClick={() => { setError(''); setReady(false); setAttempt(value => value + 1); }}>Reload 3D view</Button></div>}
    {!ready && !error && <p role="status" className="text-sm text-muted-foreground">Opening the first-person library…</p>}
    <div className={`relative h-[min(65vh,36rem)] min-h-80 overflow-hidden rounded-xl border border-border bg-[#233331] ${error ? 'hidden' : ''}`}>
      <div ref={parent} className="absolute inset-0" aria-busy={!ready && !error} />
      {ready && !error && <><div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-black/30" /><p className="pointer-events-none absolute inset-x-3 top-3 rounded-md bg-black/50 px-3 py-2 text-xs text-white">Click to look around · WASD / arrows to walk · E sit / stand · F punch · Esc free cursor</p></>}
    </div>
    {ready && !error && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><p>On touch screens, drag the room to look around and use the controls below.</p><div className="flex flex-wrap items-center gap-2" aria-label="First-person touch controls"><div className="grid grid-cols-3 gap-1"><span />{moveButton('up', 'Walk forward', '↑')}<span />{moveButton('left', 'Walk left', '←')}{moveButton('down', 'Walk backward', '↓')}{moveButton('right', 'Walk right', '→')}</div><Button variant="outline" size="sm" onClick={() => controls.current?.interact('seat')}>Sit / stand</Button><Button variant="outline" size="sm" onClick={() => controls.current?.interact('punch')}>Punch</Button></div></div>}
  </div>;
}
