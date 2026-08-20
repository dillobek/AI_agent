import { useState } from 'react';
import { api } from '../api/client';
import { Loading, ErrorState, EmptyState } from '../components/StateViews';
import { formatDate } from '../utils/format';

export default function PatientsPage() {
  const [name, setName] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!name.trim()) {
      setError('Enter a patient name to search.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/patients/search', { params: { name } });
      setResults(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Patient / Medical CRM</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Search patient name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          style={{ width: 320 }}
        />
        <button onClick={search} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {loading && <Loading label="Searching patients…" />}
      {!loading && error && <ErrorState message={error} onRetry={name.trim() ? search : undefined} />}
      {!loading && !error && results && results.length === 0 && (
        <EmptyState message={`No patients found matching "${name}".`} />
      )}

      {!loading &&
        results?.map((p) => (
          <div key={p.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <h4>
              {p.fullName} {p.phone && <span style={{ color: '#888', fontWeight: 400 }}>({p.phone})</span>}
            </h4>
            {p.prescriptions?.length === 0 && <p style={{ color: '#888' }}>No visits recorded.</p>}
            {p.prescriptions?.map((rx: any) => (
              <div key={rx.id} style={{ marginLeft: 12, marginBottom: 8 }}>
                <strong>{formatDate(rx.visitDate)}</strong> — {rx.diagnosis}
                {rx.driveFileUrl && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={rx.driveFileUrl} target="_blank" rel="noreferrer">
                      Document
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
