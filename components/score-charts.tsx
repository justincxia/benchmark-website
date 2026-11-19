'use client';

import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import { METRICS, hasData, sortRows, type MetricKey, type MetricRow } from '@/lib/metrics';

/**
 * One bar chart per metric, drawn from the same rows as the table: a bar per model, highest
 * first. Percentages run 0–100%; naturalness runs 0–5. A metric with no data gets no chart.
 */
export function ScoreCharts({ rows, columns }: { rows: MetricRow[]; columns: MetricKey[] }) {
  const charted = columns.filter((key) => hasData(rows, key));
  if (charted.length === 0) return null;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
      {charted.map((key) => (
        <Chart key={key} rows={rows} metric={key} />
      ))}
    </div>
  );
}

function Chart({ rows, metric }: { rows: MetricRow[]; metric: MetricKey }) {
  const { t } = useTheme();
  const def = METRICS.find((m) => m.key === metric)!;
  const max = def.kind === 'pct' ? 1 : 5;
  const bars = sortRows(rows, metric).filter((r) => r.metrics[metric].value !== null);

  return (
    <figure
      data-testid={`chart-${metric}`}
      className="rounded-[10px] px-[22px] py-[18px]"
      style={{ margin: 0, background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
    >
      <figcaption className="mb-3.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tracking-tight">{def.label}</span>
        <span className="text-xs" style={{ color: t.mutedFg }}>
          {def.kind === 'pct' ? '0–100%' : 'mean rating, 1–5'}
          {def.chance !== undefined && ` · dashed line = chance (${Math.round(def.chance * 100)}%)`}
        </span>
      </figcaption>
      <div className="grid items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: 'minmax(0, 11fr) minmax(0, 12fr) auto' }}>
        {bars.map((r) => {
          const value = r.metrics[metric].value as number;
          return (
            <div key={r.key} data-testid={`chart-${metric}-${r.key}`} className="contents">
              <div className="truncate text-[12.5px]" title={r.name}>
                {r.name}
              </div>
              <div className="relative h-3 overflow-hidden rounded-[3px]" style={{ background: t.muted }}>
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: t.primary }}
                />
                {def.chance !== undefined && (
                  <div
                    aria-hidden
                    className="absolute top-0 h-full"
                    style={{ left: `${def.chance * 100}%`, borderLeft: `2px dashed ${t.fg}`, opacity: 0.55 }}
                  />
                )}
              </div>
              <div className="text-right text-[12.5px] font-semibold" style={{ fontFamily: MONO }}>
                {r.metrics[metric].display}
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
