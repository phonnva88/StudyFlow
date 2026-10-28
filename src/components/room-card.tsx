import Link from 'next/link';
import { Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { DiscoveryRoom } from '@/lib/discovery-types';

export function RoomCard({ room }: { room: DiscoveryRoom }) {
  const full = room.status === 'FULL';
  return <Card className="min-w-0 border-border/80 bg-card/80">
    <CardHeader>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className={`rounded-full border px-2 py-1 ${full ? 'text-amber-300' : room.status === 'ACTIVE' ? 'text-primary' : 'text-muted-foreground'}`}>{room.status}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="size-4" />{room.participantCount}/{room.maxParticipants}</span>
      </div>
      <CardTitle className="break-words text-xl">{room.title}</CardTitle>
      <p className="break-words text-sm text-muted-foreground">Created by {room.hostName}</p>
    </CardHeader>
    <CardContent className="mt-auto space-y-4">
      <p className="text-xs text-muted-foreground">Created <time dateTime={new Date(room.createdAt).toISOString()}>{new Date(room.createdAt).toLocaleString()}</time></p>
      {full ? <Button className="w-full" disabled>Room full</Button> : <Button className="w-full" asChild><Link href={`/room/${room.id}`}>Join Room</Link></Button>}
    </CardContent>
  </Card>;
}
