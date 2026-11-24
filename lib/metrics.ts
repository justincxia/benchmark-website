// Turns per-model counts into the displayed metrics. Pure — the pages are client components
// and the unit tests exercise this without a database. Counts come from lib/db/trials.ts.

import { MODELS, type Model } from './models.ts';
import type { Exp1Counts, Exp2Counts, Exp2InterpBySentence } from './db/types.ts';

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

/** A leaderboard view: one of the two production experiments, or the model-listener results. */
export type View = 1 | 2 | 'listeners';

/**
 * `kind` is how the value is shown and charted: a share of trials, or a mean 1–5 rating.
 * `chance` (pct only) is the score of a listener that guesses, marked on the chart.
 */
export const METRICS: ReadonlyArray<{
  key: 'exp1Focus' | 'exp1Nat' | 'exp1Human' | 'exp2Interp' | 'exp2Nat' | 'listenFocus' | 'listenInterp';
  label: string;
  experiment: View;
  kind: 'pct' | 'mean';
  chance?: number;
}> = [
  { key: 'exp1Focus', label: 'Focus accuracy', experiment: 1, kind: 'pct' },
  { key: 'exp1Nat', label: 'Naturalness', experiment: 1, kind: 'mean' },
  { key: 'exp1Human', label: 'Judged human', experiment: 1, kind: 'pct' },
  { key: 'exp2Interp', label: 'Interpretation accuracy', experiment: 2, kind: 'pct' },
  { key: 'exp2Nat', label: 'Naturalness', experiment: 2, kind: 'mean' },
  { key: 'listenFocus', label: 'Focus accuracy', experiment: 'listeners', kind: 'pct', chance: 0.25 },
  { key: 'listenInterp', label: 'Interpretation accuracy', experiment: 'listeners', kind: 'pct', chance: 0.5 },
];

export type MetricKey = (typeof METRICS)[number]['key'];

export function metricsFor(view: View): MetricKey[] {
  return METRICS.filter((m) => m.experiment === view).map((m) => m.key);
}

/** True when at least one row has a value for the metric. */
export function hasData(rows: MetricRow[], key: MetricKey): boolean {
  return rows.some((r) => r.metrics[key].value !== null);
}

/** The column a table sorts by when it opens: the first one that has data, else the first. */
export function defaultSortKey(rows: MetricRow[], columns: readonly MetricKey[]): MetricKey {
  return columns.find((key) => hasData(rows, key)) ?? columns[0];
}

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

/** Every metric set to —; rows fill in the ones that apply to them. */
export function emptyMetrics(): Record<MetricKey, MetricCell> {
  return Object.fromEntries(METRICS.map((m) => [m.key, NONE])) as Record<MetricKey, MetricCell>;
}

/** A share-of-trials cell from k correct out of n. */
export function pctCell(k: number, n: number): MetricCell {
  return cell(k, n, 'pct');
}

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
        ...emptyMetrics(),
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

/**
 * The rows with Exp 2 interpretation accuracy recomputed over only the given sentences
 * (conditions). Other metrics are untouched. A model with no answered trials for those
 * sentences shows —.
 */
export function withInterpSentences(
  rows: MetricRow[],
  bySentence: Exp2InterpBySentence,
  sentences: readonly string[]
): MetricRow[] {
  return rows.map((r) => {
    if (r.metrics.exp2Interp.value === null) return r;
    let n = 0;
    let correct = 0;
    for (const s of sentences) {
      const c = bySentence[r.key]?.[s];
      if (c) {
        n += c.n;
        correct += c.correct;
      }
    }
    return { ...r, metrics: { ...r.metrics, exp2Interp: cell(correct, n, 'pct') } };
  });
}
