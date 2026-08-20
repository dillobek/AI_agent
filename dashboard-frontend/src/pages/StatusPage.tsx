import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Loading, ErrorState } from '../components/StateViews';

const STATUS_COLORS: Record<string, string> = {
  enabled: '#2e7d32',
  disabled: '#888',
  misconfigured: '#c62828',
};

export default function StatusPage() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get('/health')
      .then((res) => setHealth(res.data))
      .catch(() => setError('Could not reach the API health endpoint.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <Loading label="Checking system status…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h2>System Status</h2>
      <p style={{ color: '#666' }}>
        Overall: <strong>{health.status}</strong> · Environment: {health.environment} · Database:{' '}
        <strong style={{ color: health.database.status === 'up' ? '#2e7d32' : '#c62828' }}>{health.database.status}</strong>
      </p>

      <h3>Modules &amp; integrations</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '6px 0' }}>Module</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(health.modules).map(([name, status]) => (
            <tr key={name} style={{ borderBottom: '1px solid #f2f2f2' }}>
              <td style={{ padding: '6px 0', textTransform: 'capitalize' }}>{name.replace(/([A-Z])/g, ' $1')}</td>
              <td style={{ color: STATUS_COLORS[status as string] ?? '#333', fontWeight: 600 }}>{status as string}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#888', fontSize: 13, marginTop: 16 }}>
        "misconfigured" means the module is enabled but missing required credentials — check your .env (or re-run{' '}
        <code>npm run setup</code>).
      </p>
    </div>
  );
}
