import { RoomClient } from "@/components/room-client";
export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  return <RoomClient id={(await params).roomId} />;
}
