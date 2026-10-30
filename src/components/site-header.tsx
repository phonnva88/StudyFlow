import Link from 'next/link';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-8">
      <Brand />
      {children}
      <nav aria-label="Main navigation" className="flex w-full flex-wrap items-center justify-between gap-4 text-sm sm:w-auto sm:justify-end sm:gap-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
        <Link href="/explore" className="text-muted-foreground hover:text-foreground">Explore Rooms</Link>
        <Link href="/world" className="text-muted-foreground hover:text-foreground">Study World</Link>
        <Button asChild variant="outline" size="sm"><Link href="/#create-room">Create Room</Link></Button>
      </nav>
    </header>
  );
}
