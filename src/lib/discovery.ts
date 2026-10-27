// This type is safe to import from client components; credentials stay in the store.
export interface DiscoverableRoom {
  id: string;
  title: string;
  hostName: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: "ACTIVE" | "EMPTY" | "FULL";
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  expiresAt: number;
}
