'use client';

import { useTheme } from '@/lib/theme';
import { DEFAULT_SORT, METRICS, type MetricRow } from '@/lib/metrics';
import { MetricTable } from '@/components/metric-table';

export function LeaderboardPage({ rows }: { rows: MetricRow[] }) {
  const { t } = useTheme();
  return (
    <>
      <div className="mb-[26px]">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
          Leaderboard
        </h1>
        <p className="max-w-[640px] text-[13.5px] leading-[1.5]" style={{ margin: 0, color: t.mutedFg }}>
          Results from two human perception surveys. Click a column header to sort by it. — means the model was
          not in that experiment or there is no data yet.
        </p>
      </div>
      <MetricTable rows={rows} columns={METRICS.map((m) => m.key)} sortable defaultSort={DEFAULT_SORT} testId="lb" />
    </>
  );
}
