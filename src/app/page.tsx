'use client';

import Link from 'next/link';
import {
  ArrowRight, Check, Headphones,
  MessageCircle, MonitorUp, Radio, ShieldCheck, Video,
} from 'lucide-react';
import { Brand } from '@/components/brand';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateRoomForm } from '@/components/create-room-form';

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:px-10 lg:py-24">
          <div>
            <div className="mb-6 flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground sm:text-xs">
              <span className="size-2 rounded-full bg-primary" /> A SPACE TO SHOW UP &amp; SETTLE IN
            </div>
            <h1 className="max-w-xl text-5xl font-medium leading-[1.1] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              A little company.<br />A lot of <span className="font-serif italic text-primary">focus.</span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-muted-foreground sm:text-lg">
              Turn your solo study session into a shared one.<br className="hidden sm:block" /> Go live, invite your people, and find your flow.
            </p>
            <Button asChild variant="outline" className="mt-6"><Link href="/explore">Explore Rooms <ArrowRight /></Link></Button>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs text-secondary-foreground">
              {['No sign-up', 'Just a link', 'Your own space'].map(item => (
                <span key={item} className="inline-flex items-center gap-1.5"><Check className="size-4 text-primary" />{item}</span>
              ))}
            </div>
            <div className="mt-9 flex max-w-md items-center gap-4 border-t border-border/70 pt-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-primary"><Headphones size={21} /></span>
              <p className="text-xs leading-6 text-secondary-foreground">Less scrolling. More showing up.<br /><span className="text-muted-foreground">Good company makes the difference.</span></p>
            </div>
          </div>

          <Card id="create-room" className="scroll-mt-6 border-border/80 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur">
            <CardHeader className="gap-4 pb-2">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Radio size={22} /></span>
                <span className="rounded-full border border-border px-3 py-1.5 text-[9px] tracking-[0.16em] text-muted-foreground">LET’S GET FOCUSED</span>
              </div>
              <div>
                <CardTitle className="text-2xl tracking-tight">Make room for focus.</CardTitle>
                <CardDescription className="mt-2">Start your own little corner of the internet.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CreateRoomForm id="home-create-room" />
              <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck size={14} />No account. No commitment. Just focus.</p>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto grid max-w-6xl gap-7 border-y border-border/70 px-6 py-8 sm:grid-cols-3 lg:px-10">
          {[
            { icon: Video, title: 'Show up, together', copy: 'Go live with your camera and mic. A familiar face goes a long way.' },
            { icon: MonitorUp, title: 'Share what’s in front of you', copy: 'A textbook, a project, a blank page. Share your screen and get into it.' },
            { icon: MessageCircle, title: 'A little encouragement', copy: 'Say hello, ask a question, take a breath. Stay connected through live chat.' },
          ].map(({ icon: Icon, title, copy }) => (
            <article key={title} className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary"><Icon size={21} /></span>
              <div><h2 className="text-sm font-medium">{title}</h2><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{copy}</p></div>
            </article>
          ))}
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary">NO SETUP SPIRAL</p>
          <h2 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">From “I should study” to studying.</h2>
          <p className="mt-3 text-sm text-muted-foreground">Three small steps. One good session.</p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              ['01', 'Make your space', 'Give your room a name and make yourself at home.'],
              ['02', 'Send a little invite', 'Copy the link. Share it with your study people.'],
              ['03', 'Find your flow', 'Turn on your camera, open your books, and begin.'],
            ].map(([number, title, copy]) => (
              <article key={number} className="flex flex-col items-center">
                <span className="mb-4 flex size-9 items-center justify-center rounded-full border border-border bg-secondary text-xs text-primary">{number}</span>
                <h3 className="text-sm font-medium">{title}</h3><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
          <p className="mt-12 inline-flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Built for presence, not performance.</p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl items-center justify-between border-t border-border/70 px-6 py-6 lg:px-12">
        <Brand />
        <span className="text-xs text-muted-foreground">A quieter place to get things done.</span>
      </footer>
    </div>
  );
}
