import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import type { DiscoverableRoom } from '@/lib/discovery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function RoomCard({ room }: { room: DiscoverableRoom }) {
  const full = room.status === 'FULL';
  return (
    <Card role="article" aria-label={room.title} className="h-full min-w-0 border-border/80 bg-card/80">
      <CardHeader className="gap-4">
        <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider ${full ? 'border-amber-300/30 bg-amber-300/10 text-amber-200' : room.status === 'ACTIVE' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
          {room.status}
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-medium tracking-tight">{room.title}</h2>
          <p className="mt-2 break-words text-sm text-muted-foreground">Created by {room.hostName}</p>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <p className="flex items-center gap-2 text-sm"><Users className="size-4 text-primary" />{room.participantCount}/{room.maxParticipants} participants</p>
        <p className="text-xs text-muted-foreground">Created <time dateTime={new Date(room.createdAt).toISOString()}>{new Date(room.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>
        {full ? <Button className="w-full" disabled>Room full</Button> : <Button className="w-full justify-between" asChild><Link href={`/room/${room.id}`} prefetch={false} aria-label={`Join Room: ${room.title}`}>Join Room <ArrowRight /></Link></Button>}
      </CardContent>
    </Card>
  );
}
