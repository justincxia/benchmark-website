// Builds seed/exp1_results.csv (the Exp 1 leaderboard's source) from the in-person focus
// sessions written by `TTS Focus Task/run_in_person.py`, one CSV per session.
//
//   node --conditions=react-server scripts/build-exp1-results.ts \
//     [--from="../TTS Focus Task/in_person_results"] [--out=seed/exp1_results.csv] [--exclude=1]
//
// What it does to the session rows, and why:
//   - drops the participants in --exclude (default 1: the experimenter's own pilot sessions,
//     which analyze_in_person.py also leaves out);
//   - drops the human recordings: Human is not an Exp 1 model on the site (no human clip for
//     the "a" condition), so they have no leaderboard row;
//   - prefixes participant IDs with "inperson-" so they never collide with online survey IDs;
//   - keeps only the columns seed.ts accepts (presentationOrder and replays are dropped).
// The result is checked with seed.ts's own parser before it is written.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsvRecords } from '../lib/csv.ts';
import { parseExp1Results } from './seed.ts';

export const OUT_COLUMNS = [
  'participantID',
  'experiment',
  'trialNumber',
  'condition',
  'intendedQuestion',
  'stimulusText',
  'provider',
  'audioTake',
  'audioFile',
  'isAttentionCheck',
  'correctAnswer',
  'naturalness_rating',
  'human_or_ai',
  'question_answered',
  'attentionCheckResponse',
  'finalDistractionRating',
] as const;

export const PARTICIPANT_PREFIX = 'inperson-';

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface BuildResult {
  csv: string;
  participants: string[];
  trials: number;
  droppedHuman: number;
}

/** sessions: the text of each session CSV. Pure apart from the stimuli it validates against. */
export function buildExp1Results(sessions: string[], exclude: Set<string>, stimuliText: string): BuildResult {
  const lines = [OUT_COLUMNS.join(',')];
  const participants = new Set<string>();
  let droppedHuman = 0;
  for (const text of sessions) {
    const { records } = parseCsvRecords(text);
    for (const r of records) {
      if (exclude.has(r.participantID)) continue;
      if (r.experiment !== 'focus') continue; // the practice item is not a trial
      if (r.provider === 'human') {
        droppedHuman++;
        continue;
      }
      participants.add(r.participantID);
      const row: Record<string, string> = { ...r, participantID: PARTICIPANT_PREFIX + r.participantID };
      lines.push(OUT_COLUMNS.map((c) => csvField(row[c] ?? '')).join(','));
    }
  }
  const csv = lines.join('\n') + '\n';
  const parsed = parseExp1Results(csv, stimuliText); // throws on anything seed.ts would reject
  return {
    csv,
    participants: [...participants].sort((a, b) => Number(a) - Number(b)),
    trials: parsed.filter((t) => !t.isAttentionCheck).length,
    droppedHuman,
  };
}

function main() {
  const opt = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const from = opt('from') ?? path.join('..', 'TTS Focus Task', 'in_person_results');
  const out = opt('out') ?? path.join('seed', 'exp1_results.csv');
  const exclude = new Set((opt('exclude') ?? '1').split(',').filter(Boolean));
  const files = readdirSync(from).filter((f) => f.endsWith('.csv')).sort();
  if (files.length === 0) throw new Error(`no session CSVs in ${from}`);
  const res = buildExp1Results(
    files.map((f) => readFileSync(path.join(from, f), 'utf8')),
    exclude,
    readFileSync(path.join('seed', 'exp1_stimuli.csv'), 'utf8')
  );
  writeFileSync(out, res.csv);
  console.log(
    `${out}: ${res.trials} trials from ${res.participants.length} participants (${res.participants.join(', ')}); ` +
      `excluded participants ${[...exclude].join(', ') || 'none'}; dropped ${res.droppedHuman} human recordings`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`build-exp1-results failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
