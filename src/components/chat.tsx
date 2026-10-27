'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { chatText } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Message { id: string; sender: string; text: string; own: boolean; time: number }

export function Chat() {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const received = useRef(new Map<string, number>());

  const add = useCallback((message: Message) => {
    setMessages(current => current.some(item => item.id === message.id) ? current : [...current.slice(-199), message]);
  }, []);

  useEffect(() => {
    function receive(payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) {
      if (topic !== 'studyflow.chat' || !participant || payload.byteLength > 4096) return;
      const now = Date.now();
      if (now - (received.current.get(participant.identity) || 0) < 900) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        const message = chatText(data.text);
        if (!message || typeof data.id !== 'string' || data.id.length > 64) return;
        received.current.set(participant.identity, now);
        add({ id: `${participant.identity}:${data.id}`, sender: participant.name || 'Guest', text: message, time: now, own: false });
      } catch { /* Ignore malformed packets and render participant text literally. */ }
    }
    const rates = received.current;
    const departed = (participant: RemoteParticipant) => rates.delete(participant.identity);
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.ParticipantDisconnected, departed);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.ParticipantDisconnected, departed);
      rates.clear();
    };
  }, [room, add]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = chatText(draft);
    if (!message || sending) return;
    if (Date.now() - lastSent.current < 1000) { setError('Take a breath — one message per second.'); return; }
    setSending(true); setError(''); lastSent.current = Date.now();
    try {
      const id = crypto.randomUUID();
      await localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ id, text: message })), { reliable: true, topic: 'studyflow.chat' });
      add({ id: `${localParticipant.identity}:${id}`, text: message, sender: localParticipant.name || 'You', own: true, time: Date.now() });
      setDraft('');
    } catch { setError('Message could not be sent. Please try again.'); }
    finally { setSending(false); }
  }

  return (
    <Card className="flex h-[430px] min-h-0 flex-col gap-0 overflow-hidden border-border/80 bg-card/80 lg:h-[min(660px,75vh)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="size-4" />Live chat</h2><span className="size-2 rounded-full bg-primary" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Live chat messages">
        {!messages.length && <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-muted-foreground"><MessageCircle className="size-7 text-primary/70" /><h3 className="text-base font-medium text-secondary-foreground">Good company starts<br />with a hello.</h3><p className="text-xs leading-5">Drop a little encouragement.<br />We’re all in this together.</p></div>}
        {messages.map(message => (
          <article className="mb-4" key={message.id}>
            <div className="flex items-center justify-between gap-3"><strong className={`break-all text-xs font-medium ${message.own ? 'text-primary' : 'text-secondary-foreground'}`}>{message.sender}{message.own ? ' (you)' : ''}</strong><time className="shrink-0 text-[10px] text-muted-foreground" dateTime={new Date(message.time).toISOString()}>{new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{message.text}</p>
          </article>
        ))}
        <div ref={bottom} />
      </div>
      <form className="border-t border-border p-3" onSubmit={send}>
        {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          <Input aria-label="Chat message" placeholder="Say something kind…" value={draft} maxLength={500} onChange={event => setDraft(event.target.value)} disabled={connection !== ConnectionState.Connected} />
          <Button aria-label="Send message" size="icon" disabled={sending || !draft.trim() || connection !== ConnectionState.Connected}><Send /></Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" />Keep it kind. Keep it focused.</span><span>{draft.length}/500</span></div>
      </form>
    </Card>
  );
}
