import Link from 'next/link';

export function Navigation() {
  return <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-3 text-xs sm:gap-5 sm:text-sm">
    <Link className="text-muted-foreground hover:text-foreground" href="/">Home</Link>
    <Link className="text-muted-foreground hover:text-foreground" href="/explore">Explore Rooms</Link>
    <Link className="text-primary hover:underline" href="/#create-room">Create Room</Link>
  </nav>;
}
