"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { Brand } from "./brand";
import { Studio } from "./studio";
import { ArrowRight, Copy, Check, LoaderCircle, Radio } from "lucide-react";
export interface RoomInfo {
  id: string;
  title: string;
  hostName: string;
  state: "CREATED" | "LIVE" | "ENDED";
  expiresAt: number;
  isHost: boolean;
}
export async function api(path: string, data: unknown = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
export function InviteButton() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  return (
    <>
      <button
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              window.location.origin + window.location.pathname,
            );
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Link copied" : "Copy invite link"}
      </button>
      {failed && (
        <span className="muted" role="status">
          Copy the URL from your browser’s address bar.
        </span>
      )}
    </>
  );
}
export function RoomClient({ id }: { id: string }) {
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [fatal, setFatal] = useState("");
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    isHost: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 410) {
        setEnded(true);
        setSession(null);
        return;
      }
      if (!response.ok) {
        if (response.status === 404) setFatal(result.error);
        else setError(result.error);
        return;
      }
      setInfo(result);
    } catch {
      setError("Connection interrupted. Checking again shortly…");
    }
  }, [id]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSession(
        await api(`/api/rooms/${id}/token`, {
          nickname: info?.isHost ? info.hostName : nickname,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to join.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="room-page">
      <header className="site-header">
        <Brand />
        <InviteButton />
      </header>
      {ended || fatal ? (
        <main className="room-gate">
          <span className="small-icon">
            <Radio />
          </span>
          <h1>{ended ? "That’s a wrap." : "Room unavailable"}</h1>
          <p>
            {ended
              ? "This livestream has ended. Thanks for showing up."
              : fatal}
          </p>
          {ended && info?.isHost && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(`/api/rooms/${id}/end`);
                    setError("Media cleanup completed.");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Cleanup failed. Try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Closing media session…" : "Retry media cleanup"}
              </button>
              <span className="muted">
                Use this if the media session did not finish closing.
              </span>
              {error && <p role="status">{error}</p>}
            </>
          )}
          <Link className="primary" href="/">
            Back to StudyFlow <ArrowRight size={17} />
          </Link>
        </main>
      ) : !info ? (
        <main className="room-gate">
          {error ? (
            <>
              <p className="error" role="alert">
                {error}
              </p>
              <button className="secondary" onClick={() => void load()}>
                Try again
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" />
              <p>Finding your room…</p>
            </>
          )}
        </main>
      ) : (
        <>
          <div className="room-heading">
            <div>
              <span className="eyebrow">
                {info.isHost ? "YOUR STUDY SPACE" : "SETTLE IN & STAY AWHILE"}
              </span>
              <h1>{info.title}</h1>
              <p>Hosted by {info.hostName}</p>
            </div>
            <span className={`room-state ${info.state === "LIVE" ? "on" : ""}`}>
              <span className="status-dot" />
              {info.state === "LIVE" ? "LIVE" : "GETTING READY"}
            </span>
          </div>
          {!session ? (
            <main className="room-gate join-card">
              <span className="small-icon">
                <Radio />
              </span>
              <h2>
                {info.isHost
                  ? "Your space is ready."
                  : "A little company awaits."}
              </h2>
              <p>
                {info.isHost
                  ? "Enter your studio, check your devices, then go live."
                  : "Choose a nickname to watch and join the conversation."}
              </p>
              <form onSubmit={join}>
                {!info.isHost && (
                  <>
                    <label htmlFor="viewer-name">Your nickname</label>
                    <input
                      id="viewer-name"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={32}
                      required
                      autoComplete="nickname"
                      placeholder="What should we call you?"
                    />
                  </>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <>
                      {info.isHost ? "Enter studio" : "Join livestream"}{" "}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </form>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
            </main>
          ) : (
            <LiveKitRoom
              token={session.token}
              serverUrl={session.serverUrl}
              connect
              audio={false}
              video={false}
              onError={(e) => setError(`Media connection: ${e.message}`)}
              onDisconnected={() => {
                setSession(null);
                setError(
                  "You disconnected. You can rejoin while the room is active.",
                );
              }}
            >
              <Studio
                info={{ ...info, isHost: session.isHost }}
                refresh={() => void load()}
                onEnded={() => {
                  setEnded(true);
                  setSession(null);
                }}
              />
              {error && (
                <div className="error room-error" role="alert">
                  {error}
                </div>
              )}
            </LiveKitRoom>
          )}
        </>
      )}
    </div>
  );
}
