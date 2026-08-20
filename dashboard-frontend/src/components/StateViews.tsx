import type { ReactNode } from 'react';
import { IconAlert, IconRefresh, IconSpinner } from './Icons';

/**
 * Shared loading / empty / error presentation.
 *
 * Prefer `<SkeletonTable>` or `<SkeletonCards>` over the generic `<Loading>`
 * where the shape of the incoming data is known — a skeleton that matches the
 * final layout avoids the content jump that a centered spinner causes.
 */

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="row gap-3"
      style={{ padding: 28, color: 'var(--text-muted)', justifyContent: 'center' }}
    >
      <IconSpinner size={17} />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 96 }: { count?: number; height?: number }) {
  return (
    <div className="grid grid-stats" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: 'var(--r-lg)' }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true" style={{ padding: 14 }}>
      <div className="stack gap-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="row gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="skeleton"
                style={{
                  height: r === 0 ? 11 : 15,
                  flex: c === 0 ? 2 : 1,
                  opacity: r === 0 ? 0.6 : 1 - r * 0.1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  message,
  hint,
  icon,
}: {
  message: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className="stack gap-2"
      style={{
        alignItems: 'center',
        textAlign: 'center',
        padding: '44px 24px',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--r-lg)',
        background: 'rgba(255,255,255,0.012)',
        color: 'var(--text-muted)',
      }}
    >
      {icon && <div style={{ color: 'var(--text-faint)', marginBottom: 4 }}>{icon}</div>}
      <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{message}</p>
      {hint && <p className="small" style={{ maxWidth: 380 }}>{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="row gap-3"
      style={{
        padding: 16,
        borderRadius: 'var(--r-lg)',
        background: 'var(--danger-bg)',
        border: '1px solid rgba(248,113,113,0.28)',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color: 'var(--danger)', display: 'flex', marginTop: 1 }}>
        <IconAlert size={17} />
      </span>
      <div className="grow">
        <p style={{ color: 'var(--danger)', fontWeight: 500 }}>Something went wrong</p>
        <p className="small" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <IconRefresh size={13} />
          Retry
        </button>
      )}
    </div>
  );
}
