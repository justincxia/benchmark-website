// Loads the human survey results into SQLite. Idempotent per table: a table that already has
// rows is left untouched, so re-running is safe (the container runs it on every boot) and an
// Exp 1 CSV supplied later seeds Exp 1 without touching Exp 2. Hard-fails on an unexpected
// header, an unknown provider, or a value outside the survey's options.
//
//   node scripts/seed.ts [--fresh] [--exp1=<results.csv>] [--exp2=<summary.csv>]
//
// Exp 2 defaults to seed/exp2_results.csv. Exp 1 defaults to seed/exp1_results.csv and is
// skipped (its columns show —) when that file does not exist.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { parseCsvRecords } from '../lib/csv.ts';
import { modelByKey } from '../lib/models.ts';
import {
  INTENDED_QUESTION,
  QUESTION_OPTIONS,
  isExp1Condition,
  isExp2Condition,
} from '../lib/experiments.ts';
import {
  countRows,
  defaultDbPath,
  getExp1Counts,
  getExp2Counts,
  insertExp1Trial,
  insertExp2Trial,
  openDatabase,
  type Exp1Trial,
  type Exp2Trial,
} from '../lib/db.ts';
import { exp1ClipsFromCsv, exp2ClipsFromCsv } from '../lib/stimuli.ts';
import type { Clip } from '../lib/clips.ts';
import { buildMetricRows } from '../lib/metrics.ts';

/** Values the PCIbex summariser writes for an unanswered question (e.g. a timed-out trial). */
const MISSING = new Set(['', 'NA']);

/** summary.csv as written by TTS MOS Task_copy/analyze_results.py. */
export const EXP2_HEADER =
  'participantID,session,experiment,trialNumber,label,condition,variant,provider,audioTake,stimulusText,sonaID,intendedInterpretation,isAttentionCheck,slot,audioFile,interpretation,naturalness_rating,finalDistractionRating,correctAnswer,attentionCheckResponse';

/** analyze_results.py orders columns by whatever was logged, so the Exp 1 header is checked
 *  as a set: every required column present, nothing outside what the Focus survey logs
 *  (TTS Focus Task/DEPLOYMENT.md "Results columns", plus `session`/`label` from the
 *  summariser and `stimulusText` from main.js). */
export const EXP1_REQUIRED = [
  'participantID',
  'experiment',
  'condition',
  'intendedQuestion',
  'provider',
  'audioTake',
  'audioFile',
  'isAttentionCheck',
  'naturalness_rating',
  'human_or_ai',
  'question_answered',
] as const;
export const EXP1_ALLOWED = new Set<string>([
  ...EXP1_REQUIRED,
  'sonaID',
  'session',
  'label',
  'trialNumber',
  'stimulusText',
  'correctAnswer',
  'attentionCheckResponse',
  'finalDistractionRating',
  'training_word',
  'trainingAttempts',
]);

function fail(row: number, msg: string): never {
  throw new Error(`row ${row}: ${msg}`);
}

function bool(v: string, row: number): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  fail(row, `isAttentionCheck must be true/false, got "${v}"`);
}

/** `3 - In between unnatural and natural` → 3. Missing → null. */
export function parseNaturalness(v: string, row: number): number | null {
  if (MISSING.has(v)) return null;
  const m = /^([1-5]) - /.exec(v);
  if (!m) fail(row, `unparseable naturalness_rating "${v}"`);
  return Number(m[1]);
}

/** `B: The mirror…` → 'B'. Missing → null. */
export function parseInterpretation(v: string, row: number): 'A' | 'B' | null {
  if (MISSING.has(v)) return null;
  const m = /^([AB]):/.exec(v);
  if (!m) fail(row, `unparseable interpretation "${v}"`);
  return m[1] as 'A' | 'B';
}

function intOrNull(v: string): number | null {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) ? n : null;
}

function takeIndex(clips: Clip[]): Set<string> {
  return new Set(clips.map((c) => `${c.provider}|${c.condition}|${c.variant ?? ''}|${c.take}`));
}

// ---------------- Exp 2 ----------------

export function parseExp2Results(text: string, sourcesText: string): Exp2Trial[] {
  const { header, records } = parseCsvRecords(text);
  if (header.join(',') !== EXP2_HEADER) throw new Error(`Unexpected Exp 2 CSV header: ${header.join(',')}`);
  const takes = takeIndex(exp2ClipsFromCsv(sourcesText));

  return records.map((r, i) => {
    const row = i + 2;
    if (r.experiment !== 'ambiguityBaseline') fail(row, `unexpected experiment "${r.experiment}"`);
    const participant = r.participantID;
    if (!participant) fail(row, 'missing participantID');
    const isCheck = bool(r.isAttentionCheck, row);

    if (isCheck) {
      // Attention checks carry no provider and no audio; they are kept, flagged, and excluded
      // from every metric. A provider on one would mean the file is not what we think it is.
      if (r.provider !== '') fail(row, `attention check with a provider "${r.provider}"`);
      return {
        participant,
        trialNumber: intOrNull(r.trialNumber),
        isAttentionCheck: true,
        provider: null,
        condition: r.condition,
        variant: null,
        take: null,
        audioFile: null,
        intendedInterpretation: null,
        interpretation: null,
        naturalness: null,
      };
    }

    const m = modelByKey(r.provider);
    if (!m) fail(row, `unknown provider "${r.provider}"`);
    if (!m.exp2) fail(row, `provider "${r.provider}" is not an Exp 2 model`);
    if (!isExp2Condition(r.condition)) fail(row, `unknown sentence "${r.condition}"`);
    if (r.variant !== 'a' && r.variant !== 'b') fail(row, `bad variant "${r.variant}"`);
    const take = intOrNull(r.audioTake);
    if (take === null) fail(row, `bad audioTake "${r.audioTake}"`);
    // Ground truth is the variant of the recording (provider/condition/variant/take resolve the
    // file through audio_sources.csv). audioFile itself uses older folder names, so it is
    // stored for reference only.
    if (!takes.has(`${r.provider}|${r.condition}|${r.variant}|${take}`)) {
      fail(row, `no such recording in audio_sources.csv: ${r.provider}/${r.condition}/${r.variant}/take ${take}`);
    }
    const intended = r.variant === 'a' ? 'A' : 'B';
    if (r.intendedInterpretation !== intended) {
      fail(row, `intendedInterpretation "${r.intendedInterpretation}" disagrees with variant "${r.variant}"`);
    }
    return {
      participant,
      trialNumber: intOrNull(r.trialNumber),
      isAttentionCheck: false,
      provider: r.provider,
      condition: r.condition,
      variant: r.variant,
      take,
      audioFile: r.audioFile || null,
      intendedInterpretation: intended,
      interpretation: parseInterpretation(r.interpretation, row),
      naturalness: parseNaturalness(r.naturalness_rating, row),
    };
  });
}

// ---------------- Exp 1 ----------------

/** Rows of the `training` practice item are not trials and are dropped. */
export function parseExp1Results(text: string, stimuliText: string): Exp1Trial[] {
  const { header, records } = parseCsvRecords(text);
  const missing = EXP1_REQUIRED.filter((c) => !header.includes(c));
  const extra = header.filter((c) => !EXP1_ALLOWED.has(c));
  if (missing.length || extra.length) {
    throw new Error(
      `Unexpected Exp 1 CSV header: ${header.join(',')}` +
        (missing.length ? ` (missing: ${missing.join(', ')})` : '') +
        (extra.length ? ` (unknown: ${extra.join(', ')})` : '')
    );
  }
  const takes = takeIndex(exp1ClipsFromCsv(stimuliText));

  const out: Exp1Trial[] = [];
  records.forEach((r, i) => {
    const row = i + 2;
    if (r.experiment === 'training') return;
    if (r.experiment !== 'focus') fail(row, `unexpected experiment "${r.experiment}"`);
    const participant = r.participantID;
    if (!participant) fail(row, 'missing participantID');
    const isCheck = bool(r.isAttentionCheck, row);

    if (isCheck) {
      if (r.provider !== '') fail(row, `attention check with a provider "${r.provider}"`);
      out.push({
        participant,
        trialNumber: intOrNull(r.trialNumber ?? ''),
        isAttentionCheck: true,
        provider: null,
        condition: r.condition,
        take: null,
        audioFile: null,
        intendedQuestion: null,
        naturalness: null,
        humanOrAi: null,
        questionAnswered: null,
      });
      return;
    }

    const m = modelByKey(r.provider);
    if (!m) fail(row, `unknown provider "${r.provider}"`);
    if (!m.exp1) fail(row, `provider "${r.provider}" is not an Exp 1 model`);
    if (!isExp1Condition(r.condition)) fail(row, `unknown condition "${r.condition}"`);
    const take = intOrNull(r.audioTake);
    if (take === null) fail(row, `bad audioTake "${r.audioTake}"`);
    if (!takes.has(`${r.provider}|${r.condition}||${take}`)) {
      fail(row, `no such recording in the Exp 1 stimuli: ${r.provider}/${r.condition}/take ${take}`);
    }
    const intended = INTENDED_QUESTION[r.condition];
    if (r.intendedQuestion !== intended) {
      fail(row, `intendedQuestion "${r.intendedQuestion}" disagrees with condition "${r.condition}"`);
    }
    const answered = MISSING.has(r.question_answered) ? null : r.question_answered;
    if (answered !== null && !(QUESTION_OPTIONS as readonly string[]).includes(answered)) {
      fail(row, `question_answered "${answered}" is not a survey option`);
    }
    const hai = MISSING.has(r.human_or_ai) ? null : r.human_or_ai;
    if (hai !== null && hai !== 'Human' && hai !== 'AI') fail(row, `human_or_ai "${hai}" is not Human/AI`);

    out.push({
      participant,
      trialNumber: intOrNull(r.trialNumber ?? ''),
      isAttentionCheck: false,
      provider: r.provider,
      condition: r.condition,
      take,
      audioFile: r.audioFile || null,
      intendedQuestion: intended,
      naturalness: parseNaturalness(r.naturalness_rating, row),
      humanOrAi: hai,
      questionAnswered: answered,
    });
  });
  return out;
}

// ---------------- seeding ----------------

function inTransaction(db: DatabaseSync, fn: () => void) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Returns rows inserted; 0 when the table was already populated. */
export function seedExp2(db: DatabaseSync, csvText: string, sourcesText: string): number {
  if (countRows(db, 'exp2_trials') > 0) return 0;
  const trials = parseExp2Results(csvText, sourcesText);
  inTransaction(db, () => trials.forEach((t) => insertExp2Trial(db, t)));
  return trials.length;
}

export function seedExp1(db: DatabaseSync, csvText: string, stimuliText: string): number {
  if (countRows(db, 'exp1_trials') > 0) return 0;
  const trials = parseExp1Results(csvText, stimuliText);
  inTransaction(db, () => trials.forEach((t) => insertExp1Trial(db, t)));
  return trials.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const seed = (f: string) => path.join(process.cwd(), 'seed', f);

  const dbPath = defaultDbPath();
  if (args.includes('--fresh') && dbPath !== ':memory:') rmSync(dbPath, { force: true });
  const db = openDatabase(dbPath);

  const exp2Path = opt('exp2') ?? seed('exp2_results.csv');
  const n2 = seedExp2(db, readFileSync(exp2Path, 'utf8'), readFileSync(seed('exp2_audio_sources.csv'), 'utf8'));
  console.log(n2 === 0 ? `Exp 2: already seeded — left untouched` : `Exp 2: seeded ${n2} rows from ${exp2Path}`);

  const exp1Arg = opt('exp1');
  if (exp1Arg && !existsSync(exp1Arg)) throw new Error(`Exp 1 results CSV not found: ${exp1Arg}`);
  const exp1Path = exp1Arg ?? seed('exp1_results.csv');
  if (existsSync(exp1Path)) {
    const n1 = seedExp1(db, readFileSync(exp1Path, 'utf8'), readFileSync(seed('exp1_stimuli.csv'), 'utf8'));
    console.log(n1 === 0 ? `Exp 1: already seeded — left untouched` : `Exp 1: seeded ${n1} rows from ${exp1Path}`);
  } else {
    console.log(`Exp 1: no results CSV (${exp1Path}) — Exp 1 columns will show —`);
  }

  console.log(`Database: ${dbPath}`);
  const rows = buildMetricRows(getExp1Counts(db), getExp2Counts(db));
  const e2 = getExp2Counts(db);
  const e1 = getExp1Counts(db);
  for (const r of rows) {
    const m = r.metrics;
    const c2 = e2[r.key];
    const c1 = e1[r.key];
    console.log(
      `  ${r.name.padEnd(24)} exp1: focus=${m.exp1Focus.display} nat=${m.exp1Nat.display} human=${m.exp1Human.display}` +
        (c1 ? ` (n=${c1.trials})` : '') +
        ` | exp2: interp=${m.exp2Interp.display} (${c2 ? `${c2.interpCorrect}/${c2.interpN}` : '-'})` +
        ` nat=${m.exp2Nat.display} (${c2 ? `${c2.natSum}/${c2.natN}` : '-'})`
    );
  }
}
