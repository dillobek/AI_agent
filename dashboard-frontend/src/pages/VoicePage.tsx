import { useEffect, useRef } from 'react';
import { IconAgent, IconMicOff } from '../components/Icons';
import { VoiceOrb } from '../components/VoiceOrb';
import { useVoiceSession } from '../hooks/useVoiceSession';
import type { VoiceStatus } from '../hooks/useVoiceSession';
import '../styles/console.css';

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: 'Kutmoqda',
  connecting: 'Ulanmoqda',
  listening: 'Live',
  speaking: 'Javob bermoqda',
  error: 'Ruxsat kerak',
};

/** Entering the route requests microphone access and starts the Live session.
 * Browsers still require a user to grant microphone permission at least once. */
export default function VoicePage() {
  const { status, error, transcript, start, stop } = useVoiceSession();
  const startRef = useRef(start);
  const transcriptRef = useRef<HTMLDivElement>(null);
  startRef.current = start;

  useEffect(() => {
    void startRef.current();
  }, []);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [transcript]);

  const active = status === 'connecting' || status === 'listening' || status === 'speaking';
  const microphoneDenied = error === 'Microphone access was not granted.';

  return (
    <div className="voice-console">
      <header className="voice-console-header">
        <div className="avatar" aria-hidden="true"><IconAgent size={18} /></div>
        <div>
          <h1>JARVIS</h1>
          <p>Real-time yordamchi</p>
        </div>
        <span className={`voice-live-indicator voice-live-${status}`}><i /> {STATUS_LABEL[status]}</span>
      </header>

      <main className="voice-stage">
        <VoiceOrb status={status} />
        {!error && <p className="voice-stage-copy">Gapiring — Ali sizni eshitadi</p>}

        {error && (
          <section className="voice-permission" aria-live="assertive">
            <strong>{microphoneDenied ? 'Mikrofon ruxsati kerak' : 'Voice ulanishi ishlamadi'}</strong>
            <p>
              {microphoneDenied
                ? 'Browser manzil satridagi qulf belgisidan Microphone uchun Allow bering. Keyin qayta urinib ko‘ring.'
                : error}
            </p>
            <button className="btn btn-primary" onClick={() => void start()}>Qayta ulanish</button>
          </section>
        )}
      </main>

      {transcript.length > 0 && (
        <aside className="voice-transcript scroll-area" ref={transcriptRef} aria-label="Suhbat transkripti">
          {transcript.map((message) => (
            <div className={`voice-transcript-row voice-transcript-${message.role}`} key={message.id}>
              <span>{message.role === 'user' ? 'Siz' : 'ALI'}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </aside>
      )}

      {active && (
        <button className="voice-stop" onClick={stop} aria-label="Voice sessiyasini to‘xtatish" title="To‘xtatish">
          <IconMicOff size={18} /> To‘xtatish
        </button>
      )}
    </div>
  );
}
