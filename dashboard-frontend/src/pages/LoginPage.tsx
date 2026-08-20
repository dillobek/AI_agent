import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';
import { IconAgent, IconAlert, IconLock, IconShield, IconSpinner } from '../components/Icons';
import '../styles/theme.css';

export default function LoginPage() {
  const [telegramId, setTelegramId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/login', { telegramId, password });
      setToken(data.accessToken);
      navigate('/agent', { replace: true });
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
      const raw = response?.data?.message;
      const message = Array.isArray(raw) ? raw[0] : raw;
      setError(
        message ??
          (response?.status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : 'Sign-in failed. Check your credentials and try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 396 }} className="animate-in">
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div
            className="orb"
            aria-hidden="true"
            style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 18px' }}
          >
            <IconAgent size={28} />
          </div>
          <h1 style={{ fontSize: 23, marginBottom: 6 }}>
            Welcome <span className="gradient-text">back</span>
          </h1>
          <p className="muted" style={{ fontSize: 13 }}>
            Sign in to your AI Assistant workspace
          </p>
        </div>

        {/* Card */}
        <form onSubmit={onSubmit} className="panel panel-lit" style={{ padding: 26 }}>
          <div className="field">
            <label className="label" htmlFor="telegramId">
              Telegram ID
            </label>
            <input
              id="telegramId"
              className="input"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              autoComplete="username"
              inputMode="numeric"
              placeholder="e.g. 123456789"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
            />
          </div>

          {error && (
            <div
              role="alert"
              className="row gap-2"
              style={{
                padding: '10px 12px',
                marginBottom: 16,
                borderRadius: 'var(--r-md)',
                background: 'var(--danger-bg)',
                border: '1px solid rgba(248,113,113,0.28)',
                color: 'var(--danger)',
                fontSize: 12.5,
                alignItems: 'flex-start',
                animation: 'scale-in 200ms var(--ease-out) both',
              }}
            >
              <IconAlert size={15} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', height: 42 }}>
            {submitting ? (
              <>
                <IconSpinner size={15} />
                Signing in…
              </>
            ) : (
              <>
                <IconLock size={15} />
                Sign in
              </>
            )}
          </button>

          <div
            className="row gap-2 tiny muted"
            style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', alignItems: 'flex-start' }}
          >
            <IconShield size={13} />
            <span>
              Sessions are token-based and expire automatically. Repeated failed attempts temporarily lock the
              account.
            </span>
          </div>
        </form>

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 18, lineHeight: 1.7 }}>
          First time here? The initial admin account is created once via{' '}
          <code
            style={{
              padding: '1.5px 5px',
              borderRadius: 4,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--cyan)',
            }}
          >
            POST /auth/register-admin
          </code>{' '}
          — see the README Quick Start.
        </p>
      </div>
    </div>
  );
}
