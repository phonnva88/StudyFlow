'use client';

import { validRoomSpaceSnapshot, type RoomSpaceAction, type RoomSpacePlayer, type RoomSpaceSnapshot } from './room-space';

export class RoomSpaceClient {
  local = {x: 0, z: 4, yaw: 0, seat: null as number | null};
  snapshot: RoomSpaceSnapshot = {players: [], version: 0, serverNow: 0};
  identity = '';
  enabled = false;
  interact: (target: {seat?: number; target?: string}) => void = () => {};
  private active = false;
  private synced = false;
  private desiredEnabled = false;
  private healthy = false;
  private running: Promise<void> | null = null;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private lastRead = 0;
  private signature = '';
  private failures = 0;
  private retryAt = 0;
  private endpoint = '';
  private session = '';
  private notify: (snapshot: RoomSpaceSnapshot) => void = () => {};
  private report: (message: string) => void = () => {};

  setEnabled(value: boolean) { this.desiredEnabled = value; this.enabled = value && this.synced && this.active && this.healthy; }
  setInteraction(handler: (target: {seat?: number; target?: string}) => void) { this.interact = handler; }
  private pose() { return `${this.local.x.toFixed(3)}:${this.local.z.toFixed(3)}:${this.local.yaw.toFixed(3)}`; }
  private adopt(player: RoomSpacePlayer) { Object.assign(this.local, {x: player.x, z: player.z, yaw: player.yaw, seat: player.seat}); this.signature = this.pose(); }
  start(id: string, identity: string, session: string, notify: (snapshot: RoomSpaceSnapshot) => void, report: (message: string) => void) {
    this.stop();
    this.synced = false; this.healthy = false; this.signature = ''; this.failures = 0; this.retryAt = 0;
    this.snapshot = {players: [], version: 0, serverNow: 0};
    this.active = true; this.identity = identity; this.endpoint = `/api/rooms/${id}/space`; this.session = session; this.notify = notify; this.report = report;
    this.abort = new AbortController();
    void this.read();
    this.timer = setInterval(() => {
      if (!this.active || this.running || performance.now() < this.retryAt) return;
      if (this.enabled && this.local.seat === null && this.pose() !== this.signature) void this.request({action: 'move', x: this.local.x, z: this.local.z, yaw: this.local.yaw});
      else if (performance.now() - this.lastRead > 1000) void this.read();
    }, 220);
    return () => this.stop();
  }
  stop() { this.active = false; this.enabled = false; this.abort?.abort(); clearInterval(this.timer); this.running = null; }
  async read() { if (!this.active || this.running) return; await this.request(); }
  async act(action: RoomSpaceAction) {
    const epoch = this.abort;
    while (this.running && this.abort === epoch) await this.running;
    if (!this.active || this.abort !== epoch) return;
    await this.request(action);
  }
  private request(action?: RoomSpaceAction): Promise<void> {
    const signal = this.abort!.signal;
    const epoch = this.abort;
    const promise = (async () => {
      try {
        const response = await fetch(this.endpoint, {
          method: action ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          headers: {Authorization: `Bearer ${this.session}`, ...(action ? {'Content-Type': 'application/json'} : {})},
          body: action ? JSON.stringify(action) : undefined,
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Room interaction is unavailable.');
        if (!validRoomSpaceSnapshot(value)) throw new Error('Room interaction returned invalid data.');
        if (signal.aborted || !this.active || this.abort !== epoch) return;
        if (value.version < this.snapshot.version || (value.version === this.snapshot.version && value.serverNow < this.snapshot.serverNow)) return;
        this.snapshot = value; this.lastRead = performance.now();
        const own = value.players.find(p => p.identity === this.identity);
        if (!own) { this.synced = false; this.enabled = false; this.notify(value); throw new Error('Your place in this room is unavailable. Rejoin to continue interacting.'); }
        const modeChanged = own.seat !== this.local.seat;
        const acceptedMove = action?.action === 'move' && own.seat === null && Math.hypot(own.x - action.x, own.z - action.z) < 0.05;
        if (!this.synced || modeChanged || action?.action === 'sit' || action?.action === 'stand' || (!acceptedMove && Math.hypot(own.x - this.local.x, own.z - this.local.z) > 1.2)) this.adopt(own);
        else if (action?.action === 'move') this.signature = `${action.x.toFixed(3)}:${action.z.toFixed(3)}:${action.yaw.toFixed(3)}`;
        this.synced = true; this.healthy = true; this.failures = 0; this.retryAt = 0;
        this.enabled = this.desiredEnabled && this.active;
        this.notify(value); this.report('');
      } catch (e) {
        if (!signal.aborted && this.active && this.abort === epoch) {
          if (action?.action === 'move') { const own = this.snapshot.players.find(p => p.identity === this.identity); if (own) this.adopt(own); }
          this.healthy = false; this.enabled = false;
          this.retryAt = performance.now() + Math.min(8000, 1000 * 2 ** this.failures++);
          this.report(e instanceof Error ? e.message : 'Room interaction is unavailable.');
        }
      } finally { if (this.abort === epoch) { this.running = null; this.lastRead = performance.now(); } }
    })();
    this.running = promise;
    return promise;
  }
}
