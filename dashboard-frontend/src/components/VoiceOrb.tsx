import type { VoiceStatus } from '../hooks/useVoiceSession';
import { IconAgent, IconAlert, IconMic, IconSpinner } from './Icons';

const LABELS: Record<VoiceStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  listening: 'Listening',
  speaking: 'Speaking',
  error: 'Error',
};

/**
 * Visual state indicator for the voice session — reuses the shared `.orb`
 * gradient/glow primitive from theme.css (the same "agent presence" orb
 * `AgentPage`'s empty state uses) so the two consoles read as one
 * product, with a `voice-orb-<status>` modifier class (see console.css)
 * for the state-specific pulse/color/icon swap.
 */
export function VoiceOrb({ status }: { status: VoiceStatus }) {
  return (
    <div className="stack gap-3" style={{ alignItems: 'center' }}>
      <div className={`orb voice-orb voice-orb-${status}`} aria-hidden="true">
        {status === 'connecting' ? (
          <IconSpinner size={30} />
        ) : status === 'error' ? (
          <IconAlert size={30} />
        ) : status === 'listening' || status === 'speaking' ? (
          <IconMic size={30} />
        ) : (
          <IconAgent size={30} />
        )}
      </div>
      <div className="row gap-2" role="status" aria-live="polite">
        <span className={`dot ${status === 'listening' || status === 'speaking' ? 'dot-live' : status === 'error' ? 'dot-danger' : ''}`} />
        <span className="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
          {LABELS[status]}
        </span>
      </div>
    </div>
  );
}
