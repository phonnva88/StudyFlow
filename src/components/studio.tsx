"use client";
import { useState } from "react";
import {
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  LogOut,
  Radio,
  Users,
  LoaderCircle,
} from "lucide-react";
import { api, type RoomInfo } from "./room-client";
import { Chat } from "./chat";
export function Studio({
  info,
  refresh,
  onEnded,
}: {
  info: RoomInfo;
  refresh: () => void;
  onEnded: () => void;
}) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const {
    localParticipant,
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.ScreenShare, Track.Source.Camera]);
  const hostIdentity = `host-${info.id}`;
  const host = participants.find((p) => p.identity === hostIdentity);
  const hostTracks = tracks.filter(
    (t) => t.participant.identity === hostIdentity,
  );
  const screen = hostTracks.find((t) => t.source === Track.Source.ScreenShare);
  const camera = hostTracks.find((t) => t.source === Track.Source.Camera);
  const main = screen || camera;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Action failed. Check device permissions and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!isCameraEnabled && !isScreenShareEnabled)
      await localParticipant.setCameraEnabled(true);
    await api(`/api/rooms/${info.id}/start`);
    refresh();
  }
  return (
    <main className="studio-layout">
      <section className="video-section">
        <div className="player">
          <div className="player-top">
            <span className="player-label">
              <span className="status-dot" />
              {connection === ConnectionState.Reconnecting
                ? "RECONNECTING"
                : info.state === "LIVE"
                  ? "LIVE SESSION"
                  : "STUDIO PREVIEW"}
            </span>
            <span className="viewer-count">
              <Users size={14} />
              {participants.filter((p) => p.identity !== hostIdentity).length}
            </span>
          </div>
          {main ? (
            <VideoTrack trackRef={main} className="main-video" />
          ) : (
            <div className="video-placeholder">
              <span className="placeholder-icon">
                {connection !== ConnectionState.Connected ? (
                  <LoaderCircle className="spin" size={29} />
                ) : (
                  <Radio size={32} />
                )}
              </span>
              <h2>
                {connection !== ConnectionState.Connected
                  ? "Connecting to your space…"
                  : info.isHost
                    ? "Make yourself at home."
                    : !host
                      ? "Waiting for your host"
                      : "A quiet moment."}
              </h2>
              <p>
                {info.isHost
                  ? "Turn on your camera or share your screen to begin."
                  : !host
                    ? "They’ll be here soon. Your session will appear here."
                    : "The host’s camera is off. Audio and chat are still available."}
              </p>
            </div>
          )}
          {screen && camera && (
            <div className="camera-preview">
              <VideoTrack trackRef={camera} />
            </div>
          )}
          <span className="player-caption">
            {info.hostName}
            {info.isHost ? " · You" : ""}
          </span>
        </div>
        <RoomAudioRenderer />
        <StartAudio
          label="Click to enable livestream audio"
          className="secondary audio-enable"
        />
        <div className="control-bar">
          {info.isHost ? (
            <>
              <div className="device-controls">
                <button
                  className={`control ${isCameraEnabled ? "active" : ""}`}
                  disabled={busy || connection !== ConnectionState.Connected}
                  onClick={() =>
                    void action(() =>
                      localParticipant.setCameraEnabled(!isCameraEnabled),
                    )
                  }
                  aria-label={
                    isCameraEnabled ? "Turn camera off" : "Turn camera on"
                  }
                >
                  {isCameraEnabled ? (
                    <Video size={19} />
                  ) : (
                    <VideoOff size={19} />
                  )}
                  <span>Camera</span>
                </button>
                <button
                  className={`control ${isMicrophoneEnabled ? "active" : ""}`}
                  disabled={busy || connection !== ConnectionState.Connected}
                  onClick={() =>
                    void action(() =>
                      localParticipant.setMicrophoneEnabled(
                        !isMicrophoneEnabled,
                      ),
                    )
                  }
                  aria-label={
                    isMicrophoneEnabled
                      ? "Mute microphone"
                      : "Enable microphone"
                  }
                >
                  {isMicrophoneEnabled ? (
                    <Mic size={19} />
                  ) : (
                    <MicOff size={19} />
                  )}
                  <span>Mic</span>
                </button>
                <button
                  className={`control ${isScreenShareEnabled ? "active" : ""}`}
                  disabled={busy || connection !== ConnectionState.Connected}
                  onClick={() =>
                    void action(() =>
                      localParticipant.setScreenShareEnabled(
                        !isScreenShareEnabled,
                        { audio: true },
                      ),
                    )
                  }
                >
                  <MonitorUp size={19} />
                  <span>
                    {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
                  </span>
                </button>
              </div>
              {info.state !== "LIVE" && (
                <button
                  className="primary"
                  disabled={busy || connection !== ConnectionState.Connected}
                  onClick={() => void action(start)}
                >
                  Go live <Radio size={16} />
                </button>
              )}
              <button
                className="danger"
                disabled={busy}
                onClick={() => setConfirmEnd(true)}
              >
                End stream
              </button>
            </>
          ) : (
            <>
              <span className="muted">You’re here to focus. Settle in.</span>
              <button
                className="secondary"
                onClick={() => void room.disconnect()}
              >
                <LogOut size={16} />
                Leave
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <p className="session-note">
          {info.isHost
            ? "Only you can broadcast. Your invite link gives viewers access to watch and chat."
            : "Enjoy the session. Your camera and microphone stay private."}
        </p>
        {confirmEnd && (
          <div className="modal-backdrop">
            <div
              className="modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="end-title"
            >
              <h2 id="end-title">Call it a session?</h2>
              <p>
                Ending the livestream disconnects everyone and closes this room
                permanently.
              </p>
              <div className="modal-actions">
                <button
                  autoFocus
                  className="secondary"
                  onClick={() => setConfirmEnd(false)}
                >
                  Keep studying
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api(`/api/rooms/${info.id}/end`);
                      onEnded();
                    })
                  }
                >
                  {busy ? "Ending…" : "End for everyone"}
                </button>
              </div>
              {error && (
                <div className="error" role="alert">
                  {error} Retry ending to finish closing the media session.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      <Chat />
    </main>
  );
}
