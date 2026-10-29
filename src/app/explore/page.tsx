import type { Metadata } from 'next';
import { ExploreRooms } from '@/components/explore-rooms';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Explore Rooms | StudyFlow',
  description: 'Find a public study room and study, stream, and chat together.',
};

export default function ExplorePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary">FIND YOUR COMPANY</p>
        <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl">Explore study rooms.</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">Pull up a chair. Join a public room to study, share, and chat together. Empty rooms are open too. Your camera and microphone start off.</p>
        <ExploreRooms />
      </main>
    </div>
  );
}
