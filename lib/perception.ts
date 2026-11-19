// Server-only loader for the model-listener results: speech models (and, for Experiment 2,
// human listeners) hearing the human recordings and answering the same question the human
// survey asks. The trials come from seed/perception_trials.csv, exported from
// scripts/perception_reports by scripts/export_perception_for_website.py. The aggregation is
// pure over CSV text so tests can feed it fixtures.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsvRecords } from './csv.ts';
import { emptyMetrics, pctCell, type MetricRow } from './metrics.ts';
import { seedDir } from './stimuli.ts';

const HEADER = 'experiment,listener,run,file,condition,sentence,expected,detected,match';

/** Listener key (as in the perception reports) → display name, in table order. */
export const LISTENERS: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'human', name: 'Human listeners' },
  { key: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { key: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
  { key: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite' },
  { key: 'gpt-realtime-2', name: 'OpenAI gpt-realtime-2' },
  { key: 'grok-voice-latest', name: 'Grok Voice' },
  { key: 'hume-evi', name: 'Hume EVI' },
  { key: 'nova-2-sonic', name: 'Amazon Nova 2 Sonic' },
];

export interface ListenerCounts {
  n: number;
  correct: number;
  runs: number;
  recordings: number;
}

export interface ListenerResults {
  rows: MetricRow[];
  /** Per experiment and listener: trials, correct, runs and distinct recordings. */
  counts: Record<'1' | '2', Record<string, ListenerCounts>>;
}

export function listenerResultsFromCsv(text: string): ListenerResults {
  const { header, records } = parseCsvRecords(text);
  if (header.join(',') !== HEADER) throw new Error(`Unexpected perception trials header: ${header.join(',')}`);

  const acc: Record<'1' | '2', Record<string, { n: number; correct: number; runs: Set<string>; files: Set<string> }>> = {
    '1': {},
    '2': {},
  };
  for (const r of records) {
    if (r.experiment !== '1' && r.experiment !== '2') throw new Error(`Unknown experiment: ${r.experiment}`);
    if (!LISTENERS.some((l) => l.key === r.listener)) throw new Error(`Unknown listener: ${r.listener}`);
    const c = (acc[r.experiment][r.listener] ??= { n: 0, correct: 0, runs: new Set(), files: new Set() });
    c.n++;
    if (r.match === '1') c.correct++;
    c.runs.add(r.run);
    c.files.add(r.file);
  }

  const counts: ListenerResults['counts'] = { '1': {}, '2': {} };
  for (const exp of ['1', '2'] as const) {
    for (const [k, c] of Object.entries(acc[exp])) {
      counts[exp][k] = { n: c.n, correct: c.correct, runs: c.runs.size, recordings: c.files.size };
    }
  }

  const rows = LISTENERS.filter((l) => counts['1'][l.key] || counts['2'][l.key]).map((l) => {
    const metrics = emptyMetrics();
    const a = counts['1'][l.key];
    const b = counts['2'][l.key];
    if (a) metrics.listenFocus = pctCell(a.correct, a.n);
    if (b) metrics.listenInterp = pctCell(b.correct, b.n);
    return { key: l.key, name: l.name, metrics };
  });
  return { rows, counts };
}

export function loadListenerResults(): ListenerResults {
  return listenerResultsFromCsv(readFileSync(path.join(seedDir(), 'perception_trials.csv'), 'utf8'));
}
