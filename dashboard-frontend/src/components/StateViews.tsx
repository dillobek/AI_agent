export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ padding: 24, color: '#666' }}>
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: 24, color: '#888', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 8 }}>
      {message}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ padding: 16, background: '#fdecea', color: '#611a15', borderRadius: 8 }}>
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{ marginTop: 8 }}>
          Retry
        </button>
      )}
    </div>
  );
}
