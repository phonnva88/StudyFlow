"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  type RemoteParticipant,
} from "livekit-client";
import { MessageCircle, Send, ShieldCheck } from "lucide-react";
import { chatText } from "@/lib/validation";
interface Message {
  id: string;
  sender: string;
  text: string;
  own: boolean;
  time: number;
}
export function Chat() {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const received = useRef(new Map<string, number>());
  const add = useCallback(
    (message: Message) =>
      setMessages((m) =>
        m.some((x) => x.id === message.id) ? m : [...m.slice(-199), message],
      ),
    [],
  );
  useEffect(() => {
    function receive(
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) {
      if (
        topic !== "studyflow.chat" ||
        !participant ||
        payload.byteLength > 4096
      )
        return;
      const now = Date.now();
      if (now - (received.current.get(participant.identity) || 0) < 900) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        const text = chatText(data.text);
        if (!text || typeof data.id !== "string" || data.id.length > 64) return;
        received.current.set(participant.identity, now);
        add({
          id: participant.identity + ":" + data.id,
          sender: participant.name || "Guest",
          text,
          time: now,
          own: false,
        });
      } catch {
        /* Ignore malformed packets, never render HTML from a participant. */
      }
    }
    const rates = received.current;
    const departed = (p: RemoteParticipant) => {
      rates.delete(p.identity);
    };
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.ParticipantDisconnected, departed);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.ParticipantDisconnected, departed);
      rates.clear();
    };
  }, [room, add]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = chatText(draft);
    if (!text || sending) return;
    if (Date.now() - lastSent.current < 1000) {
      setError("Take a breath — one message per second.");
      return;
    }
    setSending(true);
    setError("");
    lastSent.current = Date.now();
    try {
      const id = crypto.randomUUID();
      await localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ id, text })),
        { reliable: true, topic: "studyflow.chat" },
      );
      add({
        id: localParticipant.identity + ":" + id,
        text,
        sender: localParticipant.name || "You",
        own: true,
        time: Date.now(),
      });
      setDraft("");
    } catch {
      setError("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }
  return (
    <aside className="chat">
      <div className="chat-heading">
        <h2>
          <MessageCircle size={17} /> Live chat
        </h2>
        <span className="status-dot" />
      </div>
      <div
        className="messages"
        role="log"
        aria-live="polite"
        aria-label="Live chat messages"
      >
        {!messages.length && (
          <div className="chat-empty">
            <MessageCircle size={28} />
            <h3>
              Good company starts
              <br />
              with a hello.
            </h3>
            <p>
              Drop a little encouragement.
              <br />
              We’re all in this together.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div className="message" key={m.id}>
            <div>
              <strong className={m.own ? "own" : ""}>
                {m.sender}
                {m.own ? " (you)" : ""}
              </strong>
              <time dateTime={new Date(m.time).toISOString()}>
                {new Date(m.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="chat-form" onSubmit={send}>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-input">
          <input
            aria-label="Chat message"
            placeholder="Say something kind…"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            disabled={connection !== ConnectionState.Connected}
          />
          <button
            aria-label="Send message"
            disabled={
              sending ||
              !draft.trim() ||
              connection !== ConnectionState.Connected
            }
          >
            <Send size={17} />
          </button>
        </div>
        <div className="chat-bottom">
          <span>
            <ShieldCheck size={12} /> Keep it kind. Keep it focused.
          </span>
          <span>{draft.length}/500</span>
        </div>
      </form>
    </aside>
  );
}
