import { useState } from 'react';
import { api } from '../api/client';
import { EmptyState, ErrorState, SkeletonTable } from '../components/StateViews';
import { IconSearch, IconSpinner, IconUsers } from '../components/Icons';
import { formatDate } from '../utils/format';

interface Prescription {
  id: string;
  visitDate: string;
  diagnosis: string;
  medication?: string;
  driveFileUrl?: string;
}

interface Patient {
  id: string;
  fullName: string;
  phone?: string | null;
  prescriptions?: Prescription[];
}

export default function PatientsPage() {
  const [name, setName] = useState('');
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const query = name.trim();
    if (!query) {
      setError('Enter a name to search for.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Patient[]>('/patients/search', { params: { name: query } });
      setResults(data);
      setSearched(query);
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
      const raw = response?.data?.message;
      setError(
        response?.status === 503
          ? 'The Records module is disabled. Enable PATIENTS_MODULE_ENABLED in your .env to use this page.'
          : (Array.isArray(raw) ? raw[0] : raw) ?? 'Search failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">
          <IconUsers size={21} />
          <h1>Records</h1>
        </div>
        <p className="page-desc">
          Look up a person's visit and prescription history. Every search is written to the audit trail.
        </p>
      </div>

      <div className="row gap-2" style={{ marginBottom: 22, maxWidth: 520 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-faint)',
              display: 'flex',
              pointerEvents: 'none',
            }}
          >
            <IconSearch size={15} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            aria-label="Patient name"
          />
        </div>
        <button className="btn btn-primary" onClick={() => void search()} disabled={loading || !name.trim()}>
          {loading ? <IconSpinner size={14} /> : <IconSearch size={14} />}
          Search
        </button>
      </div>

      {loading && <SkeletonTable rows={4} cols={3} />}
      {!loading && error && <ErrorState message={error} onRetry={name.trim() ? search : undefined} />}

      {!loading && !error && results && results.length === 0 && (
        <EmptyState
          message={`No records found for "${searched}"`}
          hint="Try a partial name, or check the spelling. Search matches on a normalized version of the full name."
          icon={<IconUsers size={26} />}
        />
      )}

      {!loading && !error && results && results.length > 0 && (
        <>
          <p className="small muted" style={{ marginBottom: 13 }}>
            {results.length} match{results.length === 1 ? '' : 'es'} for “{searched}”
          </p>

          <div className="stack gap-3">
            {results.map((patient, i) => (
              <div
                key={patient.id}
                className="card card-hover animate-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="row gap-3" style={{ marginBottom: 14 }}>
                  <div className="user-avatar" aria-hidden="true">
                    {patient.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="grow">
                    <h3 style={{ fontSize: 15 }}>{patient.fullName}</h3>
                    {patient.phone && <span className="small muted mono">{patient.phone}</span>}
                  </div>
                  <span className="badge">
                    {patient.prescriptions?.length ?? 0} visit
                    {(patient.prescriptions?.length ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>

                {!patient.prescriptions?.length ? (
                  <p className="small muted" style={{ paddingLeft: 4 }}>
                    No visits recorded for this person.
                  </p>
                ) : (
                  <div
                    className="stack gap-1"
                    style={{ borderLeft: '1px solid var(--border)', paddingLeft: 15, marginLeft: 14 }}
                  >
                    {patient.prescriptions.map((rx) => (
                      <div key={rx.id} style={{ position: 'relative', padding: '7px 0' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: -20,
                            top: 14,
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: 'var(--cyan)',
                            boxShadow: '0 0 0 3px var(--bg-panel)',
                          }}
                        />
                        <div className="row gap-2 wrap">
                          <span className="small mono" style={{ color: 'var(--cyan)' }}>
                            {formatDate(rx.visitDate)}
                          </span>
                          <span className="secondary">{rx.diagnosis}</span>
                        </div>
                        {rx.medication && (
                          <div className="small muted" style={{ marginTop: 2 }}>
                            {rx.medication}
                          </div>
                        )}
                        {rx.driveFileUrl && (
                          <a
                            className="tiny"
                            href={rx.driveFileUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            style={{ display: 'inline-block', marginTop: 4 }}
                          >
                            Open document ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!results && !loading && !error && (
        <EmptyState
          message="Search to get started"
          hint="Enter a full or partial name above. Results include visit dates, diagnoses, and any linked documents."
          icon={<IconSearch size={26} />}
        />
      )}
    </div>
  );
}
