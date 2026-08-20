import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { setToken } from '../api/client';

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
      navigate('/status');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Login failed. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h2>Admin Dashboard Login</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="telegramId">Telegram ID</label>
        <input
          id="telegramId"
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value)}
          autoComplete="username"
          style={{ width: '100%', marginBottom: 12 }}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ width: '100%', marginBottom: 12 }}
        />
        {error && (
          <p role="alert" style={{ color: '#c62828' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p style={{ color: '#888', fontSize: 13, marginTop: 16 }}>
        No account yet? The first admin account is created once via <code>POST /auth/register-admin</code> — see the
        README's Quick Start.
      </p>
    </div>
  );
}
