// Parity with the SQLite data layer: the leaderboard's inputs, read back from Supabase, must
// equal tests/fixtures/baseline-metrics.json (captured before the migration) exactly.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { countRows, getExp1Counts, getExp2Counts, getExp2InterpBySentence } from '../../lib/db/index.ts';
import { seedExp1, seedExp2 } from '../../scripts/seed.ts';
import { assertLocalSupabase, emptyTable } from '../db.ts';

const root = path.join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/baseline-metrics.json'));

const EXP2_RESULTS = read('seed/exp2_results.csv');
const SOURCES = read('seed/exp2_audio_sources.csv');

async function snapshot() {
  const [exp1Counts, exp2Counts, exp2InterpBySentence, exp1Rows, exp2Rows] = await Promise.all([
    getExp1Counts(),
    getExp2Counts(),
    getExp2InterpBySentence(),
    countRows('exp1_trials'),
    countRows('exp2_trials'),
  ]);
  return { rowCounts: { exp1_trials: exp1Rows, exp2_trials: exp2Rows }, exp1Counts, exp2Counts, exp2InterpBySentence };
}

/** The baseline minus row counts of tables this file does not own (other suites share them). */
function expected(which: 'seed' | 'seedWithExp1Fixture') {
  const b = baseline[which];
  return {
    rowCounts: { exp1_trials: b.rowCounts.exp1_trials, exp2_trials: b.rowCounts.exp2_trials },
    exp1Counts: b.exp1Counts,
    exp2Counts: b.exp2Counts,
    exp2InterpBySentence: b.exp2InterpBySentence,
  };
}

before(async () => {
  assertLocalSupabase();
  await emptyTable('exp1_trials');
  await emptyTable('exp2_trials');
});

// Leave the trial tables as `npm run seed` would on seed/: Exp 2 only.
after(async () => {
  await emptyTable('exp1_trials');
  await seedExp2(EXP2_RESULTS, SOURCES, { replace: true });
});

test('seed/ (Exp 2 only) matches the SQLite baseline exactly', async () => {
  assert.equal(await seedExp2(EXP2_RESULTS, SOURCES), 7564);
  assert.deepStrictEqual(await snapshot(), expected('seed'));
});

test('seed/ plus the Exp 1 fixture matches the SQLite baseline exactly', async () => {
  assert.equal(await seedExp1(read('tests/fixtures/exp1_results.csv'), read('seed/exp1_stimuli.csv')), 6);
  assert.deepStrictEqual(await snapshot(), expected('seedWithExp1Fixture'));
});
