'use client';

import { ConnectionState, Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { AVATAR_COLORS, readMotion, SPAWN, type Motion, type WorldAvatar } from './world';

export interface WorldModel {
  local: Motion;
  peers: Map<string, WorldAvatar>;
  enabled: boolean;
}
export function createWorldModel(): WorldModel {
  return {local: {...SPAWN, direction: 'down', animation: 'idle', seq: 0}, peers: new Map(), enabled: true};
}
// Positions stay in this mutable model, outside React rendering and Redis.
export function worldPresence(model: WorldModel, onStatus: (status: string, count: number) => void) {
  const room = new Room();
  let lastSend = 0, lastMotion = '', disposed = false;
  const received = new Map<string, number>();
  function status() { if (!disposed) onStatus(room.state, room.remoteParticipants.size + (room.state === ConnectionState.Connected ? 1 : 0)); }
  function send(force = false) {
    if (room.state !== ConnectionState.Connected) return;
    const now = performance.now();
    const {x, y, direction} = model.local;
    const animation = document.hidden || !model.enabled ? 'idle' : model.local.animation;
    const signature = `${x}:${y}:${direction}:${animation}`;
    if (!force && (now - lastSend < 100 || (signature === lastMotion && now - lastSend < 2000))) return;
    lastSend = now; lastMotion = signature;
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({x, y, direction, animation, seq: ++model.local.seq})), {reliable: force, topic: 'studyflow.world.position'}).catch(() => {});
  }
  function data(payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) {
    if (topic !== 'studyflow.world.position' || !participant || payload.byteLength > 256) return;
    const now = performance.now();
    if (now - (received.get(participant.identity) ?? -Infinity) < 80) return;
    received.set(participant.identity, now);
    try {
      const motion = readMotion(JSON.parse(new TextDecoder().decode(payload)));
      const color = JSON.parse(participant.metadata || '{}').worldAvatar;
      if (!motion || !AVATAR_COLORS.includes(color) || !participant.name?.trim() || participant.name.length > 32 || /[\u0000-\u001f\u007f]/.test(participant.name)) return;
      const old = model.peers.get(participant.identity);
      if (old && motion.seq <= old.seq) return;
      model.peers.set(participant.identity, {...motion, playerId: participant.identity, nickname: participant.name, avatarColor: color, seenAt: now});
    } catch { /* Ignore malformed or untrusted presence. */ }
  }
  const joined = () => { status(); send(true); };
  const left = (p: RemoteParticipant) => { model.peers.delete(p.identity); received.delete(p.identity); status(); };
  const reconnect = () => { model.peers.clear(); received.clear(); status(); send(true); };
  room.on(RoomEvent.DataReceived, data).on(RoomEvent.ParticipantConnected, joined).on(RoomEvent.ParticipantDisconnected, left)
    .on(RoomEvent.ConnectionStateChanged, status).on(RoomEvent.Reconnected, reconnect);
  const tick = setInterval(() => {
    send();
    for (const [id, avatar] of model.peers) if (performance.now() - avatar.seenAt > 10000) model.peers.delete(id);
  }, 100);
  const visibility = () => send(true);
  document.addEventListener('visibilitychange', visibility);
  return {
    room,
    async connect(url: string, token: string) { await room.connect(url, token, {autoSubscribe: false}); if (disposed) { await room.disconnect(); return; } send(true); status(); },
    dispose() { if (disposed) return; disposed = true; clearInterval(tick); document.removeEventListener('visibilitychange', visibility); room.removeAllListeners(); void room.disconnect(); model.peers.clear(); },
  };
}
