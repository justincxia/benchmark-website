// Turns per-model counts into the displayed metrics. Pure — the pages are client components
// and the unit tests exercise this without a database. Counts come from lib/db.ts.

import { MODELS, type Model } from './models.ts';
import type { Exp1Counts, Exp2Counts } from './db.ts';

export const DASH = '—';

/** Half-up rounding to two decimals. Naive toFixed shows 3.48 for 1394/400; this shows 3.49. */
export function formatMean(sum: number, n: number): string {
  if (n === 0) return DASH;
  return (Math.round((sum * 100) / n) / 100).toFixed(2);
}

/** A percentage to one decimal, half-up, with a % sign. */
export function formatPct(k: number, n: number): string {
  if (n === 0) return DASH;
  return (Math.round((k * 1000) / n) / 10).toFixed(1) + '%';
}

export const METRICS = [
  { key: 'exp1Focus', label: 'Exp 1 focus accuracy', experiment: 1 },
  { key: 'exp1Nat', label: 'Exp 1 naturalness', experiment: 1 },
  { key: 'exp1Human', label: 'Exp 1 judged human', experiment: 1 },
  { key: 'exp2Interp', label: 'Exp 2 interpretation accuracy', experiment: 2 },
  { key: 'exp2Nat', label: 'Exp 2 naturalness', experiment: 2 },
] as const;

export type MetricKey = (typeof METRICS)[number]['key'];
export const DEFAULT_SORT: MetricKey = 'exp1Focus';

export interface MetricCell {
  /** Sort value; null when the model was not in that experiment or has no answered trials. */
  value: number | null;
  display: string;
}

export interface MetricRow {
  key: string;
  name: string;
  metrics: Record<MetricKey, MetricCell>;
}

function cell(k: number, n: number, kind: 'pct' | 'mean'): MetricCell {
  if (n === 0) return { value: null, display: DASH };
  return { value: k / n, display: kind === 'pct' ? formatPct(k, n) : formatMean(k, n) };
}

const NONE: MetricCell = { value: null, display: DASH };

export function buildMetricRows(
  exp1: Record<string, Exp1Counts>,
  exp2: Record<string, Exp2Counts>,
  models: readonly Model[] = MODELS
): MetricRow[] {
  return models.map((m) => {
    const a = m.exp1 ? exp1[m.key] : undefined;
    const b = m.exp2 ? exp2[m.key] : undefined;
    return {
      key: m.key,
      name: m.name,
      metrics: {
        exp1Focus: a ? cell(a.focusCorrect, a.focusN, 'pct') : NONE,
        exp1Nat: a ? cell(a.natSum, a.natN, 'mean') : NONE,
        exp1Human: a ? cell(a.judgedHuman, a.humanAiN, 'pct') : NONE,
        exp2Interp: b ? cell(b.interpCorrect, b.interpN, 'pct') : NONE,
        exp2Nat: b ? cell(b.natSum, b.natN, 'mean') : NONE,
      },
    };
  });
}

/** Descending by the metric; models without a value go last; ties keep model-list order. */
export function sortRows(rows: MetricRow[], key: MetricKey): MetricRow[] {
  const order = new Map(rows.map((r, i) => [r.key, i]));
  return [...rows].sort((x, y) => {
    const a = x.metrics[key].value;
    const b = y.metrics[key].value;
    if (a === null && b === null) return order.get(x.key)! - order.get(y.key)!;
    if (a === null) return 1;
    if (b === null) return -1;
    if (b !== a) return b - a;
    return order.get(x.key)! - order.get(y.key)!;
  });
}
