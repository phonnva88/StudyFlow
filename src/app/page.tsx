"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Radio,
  ShieldCheck,
  MonitorUp,
  MessageCircle,
  Video,
  Headphones,
  Check,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { Brand } from "@/components/brand";
export default function Home() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: data.get("nickname"),
          title: data.get("title"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(result.url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to create a room. Please try again.",
      );
      setBusy(false);
    }
  }
  function focusForm() {
    form.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    form.current?.querySelector("input")?.focus({ preventScroll: true });
  }
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav>
          <a href="#how-it-works" className="nav-link">
            How it works
          </a>
          <button className="nav-cta" onClick={focusForm}>
            Create a room <ArrowUpRight size={15} />
          </button>
        </nav>
      </header>
      <main>
        <section className="hero shell">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" /> A SPACE TO SHOW UP & SETTLE IN
            </div>
            <h1>
              A little company.
              <br />A lot of <span>focus.</span>
              <svg
                className="underline"
                viewBox="0 0 270 20"
                aria-hidden="true"
              >
                <path d="M4 15 Q120 -4 263 9" />
              </svg>
            </h1>
            <p className="hero-description">
              Turn your solo study session into a shared one.
              <br className="desktop-break" /> Go live, invite your people, and
              find your flow.
            </p>
            <div className="hero-tags">
              <span>
                <Check size={14} /> No sign-up
              </span>
              <span>
                <Check size={14} /> Just a link
              </span>
              <span>
                <Check size={14} /> Your own space
              </span>
            </div>
            <div className="quiet-note">
              <span className="note-icon">
                <Headphones size={21} />
              </span>
              <p>
                Less scrolling. More showing up.
                <br />
                <strong>Good company makes the difference.</strong>
              </p>
            </div>
          </div>
          <div className="create-card">
            <div className="card-top">
              <span className="small-icon">
                <Radio size={22} />
              </span>
              <span className="pill">LET’S GET FOCUSED</span>
            </div>
            <h2>Make room for focus.</h2>
            <p>Start your own little corner of the internet.</p>
            <form ref={form} onSubmit={create}>
              <label htmlFor="nickname">Your nickname</label>
              <input
                id="nickname"
                name="nickname"
                placeholder="What should we call you?"
                autoComplete="nickname"
                required
                maxLength={32}
                disabled={busy}
              />
              <label htmlFor="title">Room title</label>
              <input
                id="title"
                name="title"
                placeholder="e.g. Late-night library hours"
                required
                maxLength={80}
                disabled={busy}
              />
              <div className="form-hint">
                <span className="status-dot" /> Your room is invite-only. You
                choose the company.
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="primary create-button" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Creating your
                    room…
                  </>
                ) : (
                  <>
                    Create Room <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <p className="card-foot">
              <ShieldCheck size={14} /> No account. No commitment. Just focus.
            </p>
          </div>
        </section>
        <section
          className="features shell"
          aria-label="Made for your study session"
        >
          <div className="feature">
            <span className="feature-icon">
              <Video size={22} />
            </span>
            <div>
              <h3>Show up, together</h3>
              <p>
                Go live with your camera and mic.
                <br />A familiar face goes a long way.
              </p>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <MonitorUp size={22} />
            </span>
            <div>
              <h3>Share what’s in front of you</h3>
              <p>
                A textbook, a project, a blank page.
                <br />
                Share your screen and get into it.
              </p>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <MessageCircle size={22} />
            </span>
            <div>
              <h3>A little encouragement</h3>
              <p>
                Say hello, ask a question, take a breath.
                <br />
                Stay connected through live chat.
              </p>
            </div>
          </div>
        </section>
        <section className="how shell" id="how-it-works">
          <div className="section-heading">
            <span className="eyebrow">NO SETUP SPIRAL</span>
            <h2>From “I should study” to studying.</h2>
            <p>Three small steps. One good session.</p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <h3>Make your space</h3>
              <p>Give your room a name and make yourself at home.</p>
            </article>
            <article>
              <span className="step-number">02</span>
              <h3>Send a little invite</h3>
              <p>
                <Link2 size={15} /> Copy the link. Share it with your study
                people.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <h3>Find your flow</h3>
              <p>Turn on your camera, open your books, and begin.</p>
            </article>
          </div>
        </section>
        <div className="bottom-note shell">
          <span className="status-dot" /> Built for presence, not performance.
        </div>
      </main>
      <footer className="site-footer shell">
        <Brand />
        <span>A quieter place to get things done.</span>
        <span>
          Made for your next chapter <ArrowUpRight size={13} />
        </span>
      </footer>
    </div>
  );
}
