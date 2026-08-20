import { useState } from 'react';
import { formatNumber } from '../utils/format';

/**
 * Grouped horizontal bar chart: income vs expense per category.
 *
 * Hand-built rather than pulled from a chart library so the marks follow the
 * project's own spec exactly — thin bars, 4px rounded data-ends anchored to a
 * shared baseline, a 2px surface gap between the paired fills, recessive
 * gridlines, and direct labels only where they fit.
 *
 * Palette: SERIES below was validated (not eyeballed) against the dark panel
 * surface #12141C for OKLCH lightness band, chroma floor, protan/deutan CVD
 * separation, normal-vision separation, and WCAG contrast. Changing either hex
 * means re-running that validation.
 */

export const SERIES = {
  income: { key: 'income', label: 'Income', color: '#0891B2' },
  expense: { key: 'expense', label: 'Expense', color: '#8B5CF6' },
} as const;

export interface CategoryRow {
  category: string;
  income: number;
  expense: number;
}

/** Rounds a max value up to a clean axis bound so gridlines land on readable numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function Bar({
  value,
  max,
  color,
  label,
  category,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  category: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  // Below ~22% the label can't sit inside the bar without clipping, so it moves outside.
  const labelInside = pct > 22;

  return (
    <div
      className="row"
      style={{ height: 18, position: 'relative' }}
      title={`${category} · ${label}: ${formatNumber(value.toFixed(2))}`}
    >
      <div
        style={{
          width: `${Math.max(pct, value > 0 ? 0.6 : 0)}%`,
          height: '100%',
          background: color,
          borderRadius: '2px 4px 4px 2px',
          transition: 'width 620ms var(--ease-out)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: labelInside ? 7 : 0,
          minWidth: value > 0 ? 3 : 0,
        }}
      >
        {labelInside && (
          <span
            className="tiny tabular"
            style={{ color: '#05060a', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {formatNumber(value.toFixed(2))}
          </span>
        )}
      </div>

      {!labelInside && value > 0 && (
        <span className="tiny tabular muted" style={{ marginLeft: 7, whiteSpace: 'nowrap' }}>
          {formatNumber(value.toFixed(2))}
        </span>
      )}
    </div>
  );
}

export default function CategoryBars({ rows }: { rows: CategoryRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const rawMax = Math.max(0, ...rows.flatMap((r) => [r.income, r.expense]));
  const max = niceMax(rawMax);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <div>
      {/* Legend — always present for 2+ series, so identity is never colour-alone */}
      <div className="row gap-4" style={{ marginBottom: 18 }}>
        {Object.values(SERIES).map((s) => (
          <div key={s.key} className="row gap-2">
            <span
              style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }}
              aria-hidden="true"
            />
            <span className="small secondary">{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 168px) 1fr', gap: '0 18px' }}>
        {rows.map((row) => (
          <div key={row.category} style={{ display: 'contents' }}>
            <div
              className="small truncate"
              style={{
                paddingTop: 9,
                paddingBottom: 9,
                color: hovered === row.category ? 'var(--text)' : 'var(--text-secondary)',
                transition: 'color var(--fast) var(--ease)',
                textAlign: 'right',
                alignSelf: 'center',
              }}
              title={row.category}
            >
              {row.category}
            </div>

            <div
              onMouseEnter={() => setHovered(row.category)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative',
                padding: '9px 0',
                borderRadius: 'var(--r-sm)',
                background: hovered === row.category ? 'rgba(255,255,255,0.025)' : 'transparent',
                transition: 'background var(--fast) var(--ease)',
              }}
            >
              {/* Recessive gridlines, behind the marks */}
              <div style={{ position: 'absolute', inset: '4px 0', pointerEvents: 'none' }} aria-hidden="true">
                {ticks.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${(i / (ticks.length - 1)) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: i === 0 ? 'var(--border-strong)' : 'rgba(255,255,255,0.04)',
                    }}
                  />
                ))}
              </div>

              {/* 2px surface gap between the paired fills */}
              <div className="stack" style={{ gap: 2, position: 'relative' }}>
                <Bar
                  value={row.income}
                  max={max}
                  color={SERIES.income.color}
                  label={SERIES.income.label}
                  category={row.category}
                />
                <Bar
                  value={row.expense}
                  max={max}
                  color={SERIES.expense.color}
                  label={SERIES.expense.label}
                  category={row.category}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Axis */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(90px, 168px) 1fr',
          gap: '0 18px',
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div />
        <div style={{ position: 'relative', height: 14 }}>
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="tiny muted tabular"
              style={{
                position: 'absolute',
                left: `${(i / (ticks.length - 1)) * 100}%`,
                transform: i === ticks.length - 1 ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatNumber(Math.round(tick))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
