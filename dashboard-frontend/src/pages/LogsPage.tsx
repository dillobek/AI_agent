import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Loading, ErrorState, EmptyState } from '../components/StateViews';
import { formatDateTime } from '../utils/format';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get('/dashboard/logs', { params: { limit: 100 } })
      .then((res) => setLogs(res.data))
      .catch((err) => setError(err?.response?.data?.message ?? 'Failed to load logs.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <h2>System Execution Logs &amp; AI Tool-Calling Activity</h2>
      <p style={{ color: '#888', fontSize: 13 }}>
        Values are redacted before storage — see docs/security.md. This view is admin-only.
      </p>

      {loading && <Loading label="Loading logs…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && logs?.length === 0 && <EmptyState message="No activity recorded yet." />}

      {!loading && !error && logs && logs.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Time</th>
              <th>Actor</th>
              <th>Tool</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>{log.actor}</td>
                <td>{log.toolName ?? '—'}</td>
                <td style={{ color: log.success ? '#2e7d32' : '#c62828' }}>{log.success ? 'OK' : 'FAILED'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
