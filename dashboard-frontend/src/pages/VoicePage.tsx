import { useEffect, useRef } from 'react';
import { IconAgent, IconMic, IconMicOff } from '../components/Icons';
import { VoiceOrb } from '../components/VoiceOrb';
import { ErrorState } from '../components/StateViews';
import { useVoiceSession } from '../hooks/useVoiceSession';
import type { VoiceStatus } from '../hooks/useVoiceSession';
import '../styles/console.css';

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  listening: 'Listening',
  speaking: 'Speaking',
  error: 'Error',
};

const STATUS_BADGE_CLASS: Record<VoiceStatus, string> = {
  idle: 'badge-accent',
  connecting: 'badge-warning',
  listening: 'badge-success',
  speaking: 'badge-success',
  error: 'badge-danger',
};

const STATUS_DOT_CLASS: Record<VoiceStatus, string> = {
  idle: '',
  connecting: 'dot-warning',
  listening: 'dot-live',
  speaking: 'dot-live',
  error: 'dot-danger',
};

/**
 * The push-to-talk voice console — "Ali". Mic capture, playback, and the
 * WebSocket session to Gemini Live all live inside `useVoiceSession`; this
 * page is presentation only, reusing `AgentPage`'s console/stream/composer
 * layout so the two consoles read as one product.
 *
 * Transcript text is rendered as plain text, not `MarkdownLite` — the
 * voice system prompt (`VOICE_SYSTEM_PROMPT`) explicitly instructs the
 * model not to use markdown in spoken-style replies, so there's nothing
 * for a markdown renderer to do here.
 */
export default function VoicePage() {
  const { status, error, transcript, start, stop } = useVoiceSession();
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, error]);

  const connected = status === 'connecting' || status === 'listening' || status === 'speaking';

  const toggle = () => {
    if (connected) {
      stop();
    } else {
      void start();
    }
  };

  return (
    <div className="console">
      <header className="console-header">
        <div className={`avatar ${status === 'connecting' ? 'avatar-thinking' : ''}`} aria-hidden="true">
          <IconMic size={18} />
        </div>

        <div className="grow">
          <div className="row gap-2">
            <h2 style={{ fontSize: 15 }}>Voice Console</h2>
            <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>
              <span className={`dot ${STATUS_DOT_CLASS[status]}`} />
              {STATUS_LABEL[status]}
            </span>
          </div>
          <div className="row gap-2 tiny muted" style={{ marginTop: 2 }}>
            <span>Say "Salom Ali" or press the button below — talk naturally in Uzbek</span>
          </div>
        </div>
      </header>

      <div className="stream scroll-area" ref={streamRef}>
        <div className="stream-inner">
          {error && <ErrorState message={error} onRetry={() => void start()} />}

          {!error && transcript.length === 0 && (
            <div className="empty-hero">
              <VoiceOrb status={status} />
              <h1 style={{ fontSize: 26, marginTop: 22, marginBottom: 8 }}>
                Ready to <span className="gradient-text">listen</span>
              </h1>
              <p className="secondary" style={{ maxWidth: 460 }}>
                Press the microphone button and start talking. Ali can build your daily plan, find
                a file, play a video, or read out today's report — and reply out loud.
              </p>
            </div>
          )}

          {!error && transcript.length > 0 && (
            <>
              <div className="row" style={{ justifyContent: 'center', margin: '4px 0 8px' }}>
                <VoiceOrb status={status} />
              </div>

              {transcript.map((m) =>
                m.role === 'user' ? (
                  <div className="msg msg-user" key={m.id}>
                    <div className="bubble-user">{m.text}</div>
                  </div>
                ) : (
                  <div className="msg" key={m.id}>
                    <div className="avatar avatar-sm" aria-hidden="true">
                      <IconAgent size={16} />
                    </div>
                    <div className="msg-agent-body">
                      <div className="agent-name">
                        <span className="gradient-text">Ali</span>
                      </div>
                      <div className="agent-text">{m.text}</div>
                    </div>
                  </div>
                ),
              )}
            </>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="row" style={{ justifyContent: 'center' }}>
          <button
            className={`ptt-btn ${connected ? 'ptt-btn-active' : ''}`}
            onClick={toggle}
            aria-label={connected ? 'Stop voice session' : 'Start voice session'}
            aria-pressed={connected}
          >
            {connected ? <IconMicOff size={22} /> : <IconMic size={22} />}
          </button>
        </div>
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 10 }}>
          {connected ? 'Tap to end the conversation' : 'Tap to start talking'}
        </p>
      </div>
    </div>
  );
}
