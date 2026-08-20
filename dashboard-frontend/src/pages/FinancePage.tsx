import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { Loading, ErrorState, EmptyState } from '../components/StateViews';
import { formatNumber } from '../utils/format';

export default function FinancePage() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get('/dashboard/pnl', { params: range })
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err?.response?.data?.message ?? 'Failed to load finance summary.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [range.startDate, range.endDate]);

  const chartData = summary
    ? Object.entries(summary.byCategory).map(([category, v]: any) => ({
        category,
        income: Number(v.income),
        expense: Number(v.expense),
      }))
    : [];

  return (
    <div>
      <h2>Finance P&amp;L</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <label>
          From{' '}
          <input type="date" value={range.startDate} onChange={(e) => setRange({ ...range, startDate: e.target.value })} />
        </label>
        <label>
          To <input type="date" value={range.endDate} onChange={(e) => setRange({ ...range, endDate: e.target.value })} />
        </label>
      </div>

      {loading && <Loading label="Loading finance summary…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && summary && (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
            <Stat label="Income" value={summary.totalIncome} />
            <Stat label="Expense" value={summary.totalExpense} />
            <Stat label="Net P&L" value={summary.netProfitLoss} />
          </div>

          {chartData.length === 0 ? (
            <EmptyState message="No transactions in this date range." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Legend />
                <Bar dataKey="income" fill="#2e7d32" name="Income" />
                <Bar dataKey="expense" fill="#c62828" name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{formatNumber(value)}</div>
    </div>
  );
}
