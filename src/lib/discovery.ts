import { listPublicRecords, publicRoom } from './room-store';
import { livekitRoom, MAX_PARTICIPANTS, roomService } from './livekit';

export async function discoverRooms() {
  const records = await listPublicRecords();
  if (!records.length) return [];
  const presence = new Map<string, number>();
  const service = roomService();
  for (let i = 0; i < records.length; i += 100) {
    const rooms = await service.listRooms(records.slice(i, i + 100).map(room => livekitRoom(room.id)));
    for (const room of rooms) presence.set(room.name, room.numParticipants);
  }
  // Re-read metadata after the upstream call so ending/deletion during that
  // call does not publish stale room records. Missing media rooms are EMPTY.
  const current = await listPublicRecords();
  const original = new Set(records.map(room => room.id));
  return current.filter(room => original.has(room.id)).map(room => {
    const participantCount = presence.get(livekitRoom(room.id)) ?? 0;
    return {
      ...publicRoom(room), participantCount, maxParticipants: MAX_PARTICIPANTS,
      status: participantCount >= MAX_PARTICIPANTS ? 'FULL' as const : participantCount > 0 ? 'ACTIVE' as const : 'EMPTY' as const,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}
