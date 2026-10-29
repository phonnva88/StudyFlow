export interface DiscoveryRoom {
  id: string;
  title: string;
  hostName: string;
  visibility: 'PUBLIC';
  status: 'ACTIVE' | 'EMPTY' | 'FULL';
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  expiresAt: number;
}
