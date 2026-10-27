import Link from "next/link";
import { AudioLines } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="StudyFlow home">
      <span className="brand-mark">
        <AudioLines size={23} strokeWidth={2.2} />
      </span>
      studyflow<span className="brand-dot">.</span>
    </Link>
  );
}
