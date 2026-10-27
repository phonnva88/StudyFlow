import Link from 'next/link';
import { AudioLines } from 'lucide-react';

export function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-2xl font-bold tracking-tight" aria-label="StudyFlow home">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <AudioLines size={22} strokeWidth={2.2} />
      </span>
      studyflow<span className="-ml-2 text-primary">.</span>
    </Link>
  );
}
