import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import { ErrorState, SkeletonCards } from '../components/StateViews';
import {
  IconActivity,
  IconAgent,
  IconChart,
  IconCpu,
  IconDatabase,
  IconLogs,
  IconPlug,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUsers,
} from '../components/Icons';

type ModuleStatus = 'enabled' | 'disabled' | 'misconfigured';

interface Health {
  status: string;
  environment?: string;
  database: { status: string };
  modules: Record<string, ModuleStatus>;
}

const MODULE_META: Record<string, { label: string; icon: ReactNode; blurb: string }> = {
  telegram: { label: 'Telegram Bot', icon: <IconAgent size={16} />, blurb: 'Chat interface with whitelist access control' },
  googleDrive: { label: 'Google Drive', icon: <IconSearch size={16} />, blurb: 'Document lookup across your Drive folders' },
  obsidian: { label: 'Obsidian', icon: <IconLogs size={16} />, blurb: 'Vault sync into the knowledge base' },
  rag: { label: 'Knowledge Base', icon: <IconCpu size={16} />, blurb: 'Semantic search over indexed documents' },
  n8n: { label: 'n8n Workflows', icon: <IconPlug size={16} />, blurb: 'Inbound triggers and outbound event webhooks' },
  finance: { label: 'Finance', icon: <IconChart size={16} />, blurb: 'Ledger, P&L, and signed receipt webhooks' },
  patients: { label: 'Records', icon: <IconUsers size={16} />, blurb: 'Patient records and prescription history' },
  dashboard: { label: 'Dashboard', icon: <IconActivity size={16} />, blurb: 'This web interface and its API' },
};

const STATUS_STYLE: Record<ModuleStatus, { badge: string; dot: string; label: string }> = {
  enabled: { badge: 'badge-success', dot: 'dot-live', label: 'Active' },
  disabled: { badge: '', dot: '', label: 'Off' },
  misconfigured: { badge: 'badge-warning', dot: 'dot-warning', label: 'Needs config' },
};

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);

    api
      .get<Health>('/health')
      .then((res) => setHealth(res.data))
      .catch(() => setError('Could not reach the API health endpoint. Is the server running?'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modules: [string, ModuleStatus][] = health ? Object.entries(health.modules) : [];
  const active = modules.filter(([, s]) => s === 'enabled').length;
  const needsAttention = modules.filter(([, s]) => s === 'misconfigured').length;
  const dbUp = health?.database.status === 'up';

  return (
    <div className="page">
      <div className="page-head row gap-4" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="page-title">
            <IconActivity size={21} />
            <h1>System Status</h1>
          </div>
          <p className="page-desc">
            Live health of the API, database, and every optional module. A module marked{' '}
            <strong style={{ color: 'var(--warning)' }}>Needs config</strong> is switched on but missing credentials —
            its endpoints will return 503 until that's fixed.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => load(true)} disabled={refreshing}>
          <IconRefresh size={13} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={() => load()} />}

      {loading && !error && <SkeletonCards count={4} />}

      {health && !loading && (
        <>
          {/* Top-line summary */}
          <div className="grid grid-stats" style={{ marginBottom: 26 }}>
            <div className="card panel-lit animate-in">
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <IconShield size={15} />
                <span className="stat-label">Overall</span>
              </div>
              <div className="row gap-2">
                <span className={`dot ${health.status === 'ok' ? 'dot-live' : 'dot-danger'}`} />
                <span className="stat-value" style={{ fontSize: 21, textTransform: 'capitalize' }}>
                  {health.status}
                </span>
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '60ms' }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <IconDatabase size={15} />
                <span className="stat-label">Database</span>
              </div>
              <div className="row gap-2">
                <span className={`dot ${dbUp ? 'dot-live' : 'dot-danger'}`} />
                <span className="stat-value" style={{ fontSize: 21, textTransform: 'capitalize' }}>
                  {health.database.status}
                </span>
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '120ms' }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <IconCpu size={15} />
                <span className="stat-label">Modules active</span>
              </div>
              <div className="stat-value">
                <span className="gradient-text">{active}</span>
                <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}> / {modules.length}</span>
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '180ms' }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <IconPlug size={15} />
                <span className="stat-label">Environment</span>
              </div>
              <div className="stat-value" style={{ fontSize: 21 }}>
                {health.environment ?? 'unknown'}
              </div>
              {needsAttention > 0 && (
                <div className="badge badge-warning" style={{ marginTop: 9 }}>
                  {needsAttention} need{needsAttention === 1 ? 's' : ''} config
                </div>
              )}
            </div>
          </div>

          {/* Module grid */}
          <h2 style={{ marginBottom: 13 }}>Modules &amp; integrations</h2>
          <div className="grid grid-cards">
            {modules.map(([name, status], i) => {
              const meta = MODULE_META[name] ?? {
                label: name.replace(/([A-Z])/g, ' $1'),
                icon: <IconCpu size={16} />,
                blurb: '',
              };
              const style = STATUS_STYLE[status] ?? STATUS_STYLE.disabled;
              const off = status === 'disabled';

              return (
                <div
                  key={name}
                  className="card card-hover animate-in"
                  style={{ animationDelay: `${i * 45}ms`, opacity: off ? 0.62 : 1 }}
                >
                  <div className="row gap-3" style={{ marginBottom: 9 }}>
                    <span style={{ color: off ? 'var(--text-muted)' : 'var(--cyan)', display: 'flex' }}>
                      {meta.icon}
                    </span>
                    <h3 style={{ fontSize: 14 }}>{meta.label}</h3>
                    <div className="grow" />
                    <span className={`badge ${style.badge}`}>
                      {style.dot && <span className={`dot ${style.dot}`} />}
                      {style.label}
                    </span>
                  </div>
                  <p className="small muted" style={{ lineHeight: 1.55 }}>
                    {meta.blurb}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="small muted" style={{ marginTop: 22, maxWidth: 640 }}>
            To turn a module on or off, update its <code style={{ color: 'var(--cyan)' }}>*_ENABLED</code> flag in{' '}
            <code style={{ color: 'var(--cyan)' }}>.env</code> — or re-run{' '}
            <code style={{ color: 'var(--cyan)' }}>npm run setup</code> for a guided walkthrough.
          </p>
        </>
      )}
    </div>
  );
}
