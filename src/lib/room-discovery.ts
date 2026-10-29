import { livekitRoom, MAX_PARTICIPANTS, roomService } from "./livekit";
import { type StudyRoom } from "./room-store";
import { type DiscoverableRoom } from "./discovery";

export async function discoverRooms(rooms: StudyRoom[]): Promise<DiscoverableRoom[]> {
  const counts = new Map<string, number>();
  const service = roomService();
  for (let offset = 0; offset < rooms.length; offset += 100) {
    // Query only known application rooms. Missing media rooms are empty, not ended.
    const mediaRooms = await service.listRooms(rooms.slice(offset, offset + 100).map(room => livekitRoom(room.id)));
    for (const room of mediaRooms) counts.set(room.name, room.numParticipants);
  }
  // An upstream failure must propagate: never present guessed zero counts.
  return rooms.filter(room => room.state !== "ENDED" && room.expiresAt > Date.now()).map(room => {
    // LiveKit counts identities, independently of cameras/screens or number of tracks.
    const participantCount = counts.get(livekitRoom(room.id)) ?? 0;
    return {
      id: room.id,
      title: room.title,
      hostName: room.hostName,
      visibility: room.visibility ?? "PRIVATE",
      status: participantCount >= MAX_PARTICIPANTS ? "FULL" : participantCount > 0 ? "ACTIVE" : "EMPTY",
      participantCount,
      maxParticipants: MAX_PARTICIPANTS,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  });
}
