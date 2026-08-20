import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { EmptyState, ErrorState, SkeletonCards } from '../components/StateViews';
import CategoryBars, { CategoryRow, SERIES } from '../components/CategoryBars';
import { IconChart, IconLogs, IconRefresh } from '../components/Icons';
import { formatNumber } from '../utils/format';

interface Summary {
  period: { startDate: string; endDate: string };
  totalIncome: string;
  totalExpense: string;
  netProfitLoss: string;
  byCategory: Record<string, { income: string; expense: string }>;
  transactionCount: number;
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: 'month' | 'last30' | 'quarter' | 'ytd'): { start: string; end: string } {
  const now = new Date();
  const end = toISODate(now);

  switch (preset) {
    case 'month':
      return { start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
    case 'last30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { start: toISODate(from), end };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { start: toISODate(new Date(now.getFullYear(), q, 1)), end };
    }
    case 'ytd':
      return { start: toISODate(new Date(now.getFullYear(), 0, 1)), end };
  }
}

export default function FinancePage() {
  const initial = presetRange('month');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [activePreset, setActivePreset] = useState<string | null>('month');
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Summary>('/dashboard/pnl', { params: { startDate, endDate } })
      .then((res) => setData(res.data))
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 503
            ? 'The Finance module is disabled. Enable FINANCE_MODULE_ENABLED in your .env to use this page.'
            : 'Could not load the financial summary.',
        );
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (preset: 'month' | 'last30' | 'quarter' | 'ytd') => {
    const range = presetRange(preset);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(preset);
  };

  const rows: CategoryRow[] = useMemo(() => {
    if (!data) return [];
    const entries = Object.entries(data.byCategory) as [string, { income: string; expense: string }][];
    return entries
      .map(([category, v]) => ({
        category,
        income: Number(v.income),
        expense: Number(v.expense),
      }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [data]);

  const net = data ? Number(data.netProfitLoss) : 0;
  const profitable = net >= 0;

  const presets: { id: 'month' | 'last30' | 'quarter' | 'ytd'; label: string }[] = [
    { id: 'month', label: 'This month' },
    { id: 'last30', label: 'Last 30 days' },
    { id: 'quarter', label: 'This quarter' },
    { id: 'ytd', label: 'Year to date' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">
          <IconChart size={21} />
          <h1>Finance</h1>
        </div>
        <p className="page-desc">
          Income, expenses, and net position for the selected period, broken down by category.
        </p>
      </div>

      {/* Filters — one row above the charts */}
      <div className="row gap-3 wrap" style={{ marginBottom: 22 }}>
        <div className="row gap-1 wrap">
          {presets.map((p) => (
            <button
              key={p.id}
              className={`btn btn-sm ${activePreset === p.id ? 'btn-primary' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="row gap-2">
          <input
            type="date"
            className="input"
            style={{ width: 150, height: 30, fontSize: 12 }}
            value={startDate}
            max={endDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setActivePreset(null);
            }}
            aria-label="Start date"
          />
          <span className="muted small">→</span>
          <input
            type="date"
            className="input"
            style={{ width: 150, height: 30, fontSize: 12 }}
            value={endDate}
            min={startDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setActivePreset(null);
            }}
            aria-label="End date"
          />
        </div>

        <div className="grow" />

        <button className="btn btn-sm" onClick={load} disabled={loading}>
          <IconRefresh size={13} />
          Refresh
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !error && <SkeletonCards count={4} />}

      {data && !loading && !error && (
        <>
          {/* Headline numbers */}
          <div className="grid grid-stats" style={{ marginBottom: 26 }}>
            <div className="card panel-lit animate-in">
              <div className="stat-label" style={{ marginBottom: 9 }}>
                Net profit / loss
              </div>
              <div
                className="stat-value"
                style={{ color: profitable ? 'var(--success)' : 'var(--danger)' }}
              >
                {profitable ? '+' : '−'}
                {formatNumber(Math.abs(net).toFixed(2))}
              </div>
              {/* Status is carried by an icon + word, never colour alone */}
              <div
                className={`badge ${profitable ? 'badge-success' : 'badge-danger'}`}
                style={{ marginTop: 10 }}
              >
                {profitable ? '▲ Surplus' : '▼ Deficit'}
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '60ms' }}>
              <div className="stat-label" style={{ marginBottom: 9 }}>
                Total income
              </div>
              <div className="stat-value">{formatNumber(data.totalIncome)}</div>
              <div className="row gap-2" style={{ marginTop: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SERIES.income.color }} />
                <span className="tiny muted">Money in</span>
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '120ms' }}>
              <div className="stat-label" style={{ marginBottom: 9 }}>
                Total expense
              </div>
              <div className="stat-value">{formatNumber(data.totalExpense)}</div>
              <div className="row gap-2" style={{ marginTop: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SERIES.expense.color }} />
                <span className="tiny muted">Money out</span>
              </div>
            </div>

            <div className="card animate-in" style={{ animationDelay: '180ms' }}>
              <div className="stat-label" style={{ marginBottom: 9 }}>
                Transactions
              </div>
              <div className="stat-value">{formatNumber(data.transactionCount)}</div>
              <div className="tiny muted" style={{ marginTop: 10 }}>
                {data.period.startDate} → {data.period.endDate}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="row gap-3" style={{ marginBottom: 15 }}>
            <h2>By category</h2>
            <div className="grow" />
            <div className="row gap-1">
              <button
                className={`btn btn-sm ${view === 'chart' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setView('chart')}
                aria-pressed={view === 'chart'}
              >
                <IconChart size={13} />
                Chart
              </button>
              <button
                className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
              >
                <IconLogs size={13} />
                Table
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              message="No transactions in this period"
              hint="Pick a wider date range, or add transactions via the API or the signed receipt webhook."
              icon={<IconChart size={26} />}
            />
          ) : view === 'chart' ? (
            <div className="card" style={{ padding: 22 }}>
              <CategoryBars rows={rows} />
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Income and expense totals by category</caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Income</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Expense</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rowNet = r.income - r.expense;
                    return (
                      <tr key={r.category}>
                        <td>{r.category}</td>
                        <td className="tabular" style={{ textAlign: 'right' }}>{formatNumber(r.income.toFixed(2))}</td>
                        <td className="tabular" style={{ textAlign: 'right' }}>{formatNumber(r.expense.toFixed(2))}</td>
                        <td
                          className="tabular"
                          style={{ textAlign: 'right', color: rowNet >= 0 ? 'var(--success)' : 'var(--danger)' }}
                        >
                          {rowNet >= 0 ? '+' : '−'}
                          {formatNumber(Math.abs(rowNet).toFixed(2))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="tiny muted" style={{ marginTop: 14 }}>
            Amounts are stored as exact decimals and shown in your locale's number format. The application is
            currency-agnostic — it records amounts, not a currency unit.
          </p>
        </>
      )}
    </div>
  );
}
