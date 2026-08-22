import type { VoiceStatus } from '../hooks/useVoiceSession';

const LABELS: Record<VoiceStatus, string> = {
  idle: 'Kutmoqda',
  connecting: 'Ulanmoqda',
  listening: 'Tinglayapman',
  speaking: 'Javob bermoqdaman',
  error: 'Ulanish xatosi',
};

/**
 * Hands-free Jarvis status core. The rings are CSS so live state can animate
 * without fetching a decorative image.
 */
export function VoiceOrb({ status }: { status: VoiceStatus }) {
  return (
    <div className="jarvis-orb-wrap" role="status" aria-live="polite">
      <div className={`jarvis-orb jarvis-orb-${status}`} aria-hidden="true">
        <span className="jarvis-ring jarvis-ring-outer" />
        <span className="jarvis-ring jarvis-ring-middle" />
        <span className="jarvis-ring jarvis-ring-inner" />
        <span className="jarvis-core">ALI</span>
      </div>
      <span className="jarvis-status">{LABELS[status]}</span>
    </div>
  );
}
