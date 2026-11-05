'use client';

import { useState } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import { METRICS, sortRows, type MetricKey, type MetricRow } from '@/lib/metrics';

/**
 * The results table shared by the leaderboard and the two experiment pages: one row per
 * model, one column per metric. With `sortable`, each metric header sorts descending by it.
 */
export function MetricTable({
  rows,
  columns,
  sortable = false,
  defaultSort,
  testId,
}: {
  rows: MetricRow[];
  columns: MetricKey[];
  sortable?: boolean;
  defaultSort?: MetricKey;
  testId: string;
}) {
  const { t } = useTheme();
  const [sortKey, setSortKey] = useState<MetricKey | null>(defaultSort ?? null);
  const shown = sortable && sortKey ? sortRows(rows, sortKey) : rows;
  const grid = `minmax(190px,1.6fr) repeat(${columns.length}, minmax(120px,1fr))`;
  const minWidth = 190 + columns.length * 120 + 44;

  return (
    <div
      className="overflow-x-auto rounded-[10px]"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
    >
      <div data-testid={testId} style={{ minWidth }}>
        <div
          className="grid items-center px-[22px] py-[11px] text-xs font-medium"
          style={{ gridTemplateColumns: grid, background: t.muted, borderBottom: `1px solid ${t.border}`, color: t.mutedFg }}
        >
          <div>Model</div>
          {columns.map((key) => {
            const label = METRICS.find((m) => m.key === key)!.label;
            const active = sortable && sortKey === key;
            return sortable ? (
              <button
                key={key}
                type="button"
                data-testid={`sort-${key}`}
                aria-pressed={active}
                onClick={() => setSortKey(key)}
                className="cursor-pointer border-0 bg-transparent p-0 text-right text-xs font-medium"
                style={{ color: active ? t.fg : t.mutedFg, fontFamily: 'inherit' }}
              >
                {label}
                <span className="ml-1" style={{ visibility: active ? 'visible' : 'hidden' }}>
                  ↓
                </span>
              </button>
            ) : (
              <div key={key} className="text-right">
                {label}
              </div>
            );
          })}
        </div>

        {shown.map((r) => (
          <Row key={r.key} row={r} grid={grid} columns={columns} testId={testId} />
        ))}
      </div>
    </div>
  );
}

function Row({ row, grid, columns, testId }: { row: MetricRow; grid: string; columns: MetricKey[]; testId: string }) {
  const { t } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-testid={`${testId}-row-${row.key}`}
      className="grid items-center px-[22px] py-3.5"
      style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${t.border}`, background: hovered ? t.muted : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="truncate text-[13.5px] font-semibold tracking-tight">{row.name}</div>
      {columns.map((key) => (
        <div
          key={key}
          data-testid={`${testId}-${row.key}-${key}`}
          className="text-right text-[13.5px] font-semibold"
          style={{ fontFamily: MONO, color: row.metrics[key].value === null ? t.mutedFg : t.fg }}
        >
          {row.metrics[key].display}
        </div>
      ))}
    </div>
  );
}
