'use client';

import { useState, type ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import { METRICS, defaultSortKey, sortRows, type MetricKey, type MetricRow } from '@/lib/metrics';

/**
 * The leaderboard's results table: one row per model, one column per metric. Each metric
 * header sorts descending by it. It opens sorted by the first column that has data.
 */
export function MetricTable({
  rows,
  columns,
  headerExtras,
  testId,
  nameLabel = 'Model',
}: {
  /** Header of the first column. */
  nameLabel?: string;
  rows: MetricRow[];
  columns: MetricKey[];
  /** A control shown beside a column's label (for example a filter for that column). */
  headerExtras?: Partial<Record<MetricKey, ReactNode>>;
  testId: string;
}) {
  const { t } = useTheme();
  const [sortKey, setSortKey] = useState<MetricKey>(() => defaultSortKey(rows, columns));
  const shown = sortRows(rows, sortKey);
  const grid = `minmax(190px,1.6fr) repeat(${columns.length}, minmax(${headerExtras ? 150 : 120}px,1fr))`;
  const minWidth = 190 + columns.length * (headerExtras ? 150 : 120) + 44;

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
          <div>{nameLabel}</div>
          {columns.map((key) => {
            const label = METRICS.find((m) => m.key === key)!.label;
            const active = sortKey === key;
            const sort = (
              <button
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
            );
            return (
              <div key={key} className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                {sort}
                {headerExtras?.[key]}
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
