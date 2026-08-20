import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { EmptyState, ErrorState, SkeletonTable } from '../components/StateViews';
import { IconCheck, IconLogs, IconRefresh, IconShield, IconX } from '../components/Icons';
import { formatDateTime } from '../utils/format';

interface LogRow {
  id: string;
  createdAt: string;
  actor: string;
  toolName?: string | null;
  success: boolean;
  errorMsg?: string | null;
}

type Filter = 'all' | 'ok' | 'failed';

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<LogRow[]>('/dashboard/logs', { params: { limit: 100 } })
      .then((res) => setLogs(res.data))
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 403
            ? 'Activity logs are admin-only. Your account does not have the ADMIN role.'
            : 'Failed to load activity logs.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    if (filter === 'ok') return logs.filter((l) => l.success);
    if (filter === 'failed') return logs.filter((l) => !l.success);
    return logs;
  }, [logs, filter]);

  const failedCount = logs?.filter((l) => !l.success).length ?? 0;

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: logs?.length },
    { id: 'ok', label: 'Succeeded', count: (logs?.length ?? 0) - failedCount },
    { id: 'failed', label: 'Failed', count: failedCount },
  ];

  return (
    <div className="page">
      <div className="page-head row gap-4" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="page-title">
            <IconLogs size={21} />
            <h1>Activity Log</h1>
          </div>
          <p className="page-desc">
            Every tool the AI agent has executed, plus system operations. Arguments and outputs are redacted before
            storage and are not shown here.
          </p>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          <IconRefresh size={13} />
          Refresh
        </button>
      </div>

      <div
        className="row gap-2"
        style={{
          padding: '9px 13px',
          marginBottom: 18,
          borderRadius: 'var(--r-md)',
          background: 'rgba(34,211,238,0.04)',
          border: '1px solid var(--border-accent)',
          alignItems: 'flex-start',
        }}
      >
        <span style={{ color: 'var(--cyan)', display: 'flex', marginTop: 1 }}>
          <IconShield size={14} />
        </span>
        <span className="small secondary">
          Admin-only view. Entries older than your <code style={{ color: 'var(--cyan)' }}>LOG_RETENTION_DAYS</code>{' '}
          setting are purged automatically.
        </span>
      </div>

      {!loading && !error && logs && logs.length > 0 && (
        <div className="row gap-1" style={{ marginBottom: 14 }}>
          {filters.map((f) => (
            <button
              key={f.id}
              className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
              {f.count !== undefined && (
                <span className="mono tiny" style={{ opacity: 0.75 }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading && <SkeletonTable rows={7} cols={4} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && logs?.length === 0 && (
        <EmptyState
          message="No activity recorded yet"
          hint="Once the agent runs a tool — from the console, Telegram, or n8n — it will appear here."
          icon={<IconLogs size={26} />}
        />
      )}

      {!loading && !error && logs && logs.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Recent agent and system activity</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Tool</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td className="mono tiny muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="small">
                    <span className="truncate" style={{ display: 'block', maxWidth: 220 }} title={log.actor}>
                      {log.actor}
                    </span>
                  </td>
                  <td className="mono small" style={{ color: log.toolName ? 'var(--cyan)' : 'var(--text-faint)' }}>
                    {log.toolName ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${log.success ? 'badge-success' : 'badge-danger'}`}>
                      {log.success ? <IconCheck size={11} strokeWidth={2.6} /> : <IconX size={11} strokeWidth={2.6} />}
                      {log.success ? 'OK' : 'Failed'}
                    </span>
                    {!log.success && log.errorMsg && (
                      <div className="tiny muted" style={{ marginTop: 4, maxWidth: 300 }}>
                        {log.errorMsg}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 22 }}>
              <p className="small muted" style={{ textAlign: 'center' }}>
                No entries match this filter.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
