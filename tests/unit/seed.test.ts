import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { countRows, getExp1Counts, getExp2Counts, getSupabase, seedExp2Trials, type Exp2Trial } from '../../lib/db/index.ts';
import { buildMetricRows } from '../../lib/metrics.ts';
import { seedExp1, seedExp2, parseExp2Results, EXP2_HEADER } from '../../scripts/seed.ts';
import { assertLocalSupabase, emptyTable } from '../db.ts';

// This file owns exp1_trials and exp2_trials outright. Each DB test starts from empty tables,
// and the tables are left seeded from seed/ (Exp 2 only), like `npm run seed`, at the end.

const root = path.join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const SOURCES = read('seed/exp2_audio_sources.csv');
const EXP1_STIMULI = read('seed/exp1_stimuli.csv');
const EXP2_FIXTURE = read('tests/fixtures/exp2_results.csv');
const EXP1_FIXTURE = read('tests/fixtures/exp1_results.csv');

async function emptyTrials() {
  await emptyTable('exp1_trials');
  await emptyTable('exp2_trials');
}

async function attentionChecks(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('exp2_trials')
    .select('*', { count: 'exact', head: true })
    .eq('is_attention_check', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function metrics() {
  const [e1, e2] = await Promise.all([getExp1Counts(), getExp2Counts()]);
  return Object.fromEntries(buildMetricRows(e1, e2).map((r) => [r.key, r.metrics]));
}

before(() => assertLocalSupabase());

after(async () => {
  await emptyTable('exp1_trials');
  await seedExp2(read('seed/exp2_results.csv'), SOURCES, { replace: true });
});

test('Exp 2: seeds trials, keeps attention checks flagged, and excludes them from metrics', async () => {
  await emptyTrials();
  assert.equal(await seedExp2(EXP2_FIXTURE, SOURCES), 6);
  const counts = await getExp2Counts();
  assert.deepEqual(Object.keys(counts).sort(), ['gemini_tts', 'human']);
  // gemini_tts: 4 trials. Interpretation answered on 3 (one NA), 2 correct.
  // Naturalness answered on 2 (3 and 4).
  assert.deepEqual(counts.gemini_tts, { trials: 4, interpN: 3, interpCorrect: 2, natN: 2, natSum: 7 });
  const m = await metrics();
  assert.equal(m.gemini_tts.exp2Interp.display, '66.7%');
  assert.equal(m.gemini_tts.exp2Nat.display, '3.50');
  assert.equal(m.human.exp2Interp.display, '100.0%');
  assert.equal(m.human.exp2Nat.display, '5.00');
  assert.equal(await attentionChecks(), 1);
});

test('Exp 1: computes focus accuracy, naturalness and judged-human from the fixture', async () => {
  await emptyTrials();
  // 7 data rows: the training row is dropped, the attention check is kept but flagged.
  assert.equal(await seedExp1(EXP1_FIXTURE, EXP1_STIMULI), 6);
  const m = await metrics();
  // hume: melon ✓, a ✗ (answered "What happened?"), broad ✓ → 2/3. Ratings 4, 3, 4. One "Human".
  assert.equal(m.hume.exp1Focus.display, '66.7%');
  assert.equal(m.hume.exp1Nat.display, '3.67');
  assert.equal(m.hume.exp1Human.display, '33.3%');
  // elevenlabs_v4: one answered trial (wrong), one all-NA trial left out of every denominator.
  assert.equal(m.elevenlabs_v4.exp1Focus.display, '0.0%');
  assert.equal(m.elevenlabs_v4.exp1Nat.display, '2.00');
  assert.equal(m.elevenlabs_v4.exp1Human.display, '0.0%');
  assert.equal((await getExp1Counts()).elevenlabs_v4.trials, 2);
  // Not in the fixture, or not in Exp 1 at all.
  assert.equal(m.grok_tts.exp1Focus.display, '—');
  assert.equal(m.human.exp1Focus.display, '—');
});

test('seeding is idempotent per table', async () => {
  await emptyTrials();
  await seedExp2(EXP2_FIXTURE, SOURCES);
  assert.equal(await seedExp2(EXP2_FIXTURE, SOURCES), 0);
  assert.equal(await countRows('exp2_trials'), 6);
  // Exp 1 arriving later still seeds into its own table.
  assert.equal(await seedExp1(EXP1_FIXTURE, EXP1_STIMULI), 6);
  assert.equal(await seedExp1(EXP1_FIXTURE, EXP1_STIMULI), 0);
  assert.equal(await countRows('exp1_trials'), 6);
  // (responses is shared with other test files, so it is not asserted empty here.)
});

test('replace empties the table first and reseeds it', async () => {
  await emptyTrials();
  await seedExp2(EXP2_FIXTURE, SOURCES);
  assert.equal(await seedExp2(EXP2_FIXTURE, SOURCES, { replace: true }), 6);
  assert.equal(await countRows('exp2_trials'), 6);
});

test('a seed the database rejects leaves no partial table', async () => {
  await emptyTrials();
  const good = parseExp2Results(EXP2_FIXTURE, SOURCES);
  const bad: Exp2Trial = { ...good.find((t) => !t.isAttentionCheck)!, naturalness: 9 };
  await assert.rejects(seedExp2Trials([...good, bad]), /seed_exp2_trials/);
  assert.equal(await countRows('exp2_trials'), 0);
});

const exp2Row = (over: Record<string, string>) => {
  const cols = EXP2_HEADER.split(',');
  const base: Record<string, string> = {
    participantID: 'p', session: '0', experiment: 'ambiguityBaseline', trialNumber: '1', label: 'trial_lisa_telescope',
    condition: 'lisa_telescope', variant: 'a', provider: 'hume', audioTake: '1', stimulusText: 'x', sonaID: 'p',
    intendedInterpretation: 'A', isAttentionCheck: 'false', slot: '1', audioFile: 'x.wav',
    interpretation: 'A: Lisa used the telescope to see the man.', naturalness_rating: '4 - Mostly natural',
    finalDistractionRating: '', correctAnswer: '', attentionCheckResponse: '',
  };
  const r = { ...base, ...over };
  return EXP2_HEADER + '\n' + cols.map((c) => r[c]).join(',') + '\n';
};

test('Exp 2: the base row used by the failure tests is itself valid', () => {
  assert.equal(parseExp2Results(exp2Row({}), SOURCES).length, 1);
});

test('Exp 2: hard-fails on an unexpected header', () => {
  assert.throws(() => parseExp2Results(exp2Row({}).replace('provider', 'model'), SOURCES), /Unexpected Exp 2 CSV header/);
});

test('Exp 2: hard-fails on an unknown provider', () => {
  assert.throws(() => parseExp2Results(exp2Row({ provider: 'sesame' }), SOURCES), /unknown provider "sesame"/);
});

test('Exp 2: hard-fails on a model that was not in Exp 2', () => {
  assert.throws(() => parseExp2Results(exp2Row({ provider: 'elevenlabs_v4' }), SOURCES), /not an Exp 2 model/);
});

test('Exp 2: hard-fails on a blank provider outside an attention check', () => {
  assert.throws(() => parseExp2Results(exp2Row({ provider: '' }), SOURCES), /unknown provider ""/);
});

test('Exp 2: hard-fails when intendedInterpretation disagrees with the recording', () => {
  assert.throws(() => parseExp2Results(exp2Row({ intendedInterpretation: 'B' }), SOURCES), /disagrees with variant/);
});

test('Exp 2: hard-fails on a take that does not exist', () => {
  assert.throws(() => parseExp2Results(exp2Row({ audioTake: '9' }), SOURCES), /no such recording/);
});

test('Exp 2: hard-fails on an unparseable answer', () => {
  assert.throws(() => parseExp2Results(exp2Row({ naturalness_rating: 'great' }), SOURCES), /naturalness_rating/);
  assert.throws(() => parseExp2Results(exp2Row({ interpretation: 'C: no' }), SOURCES), /interpretation/);
});

test('Exp 2: a seed that fails validation sends nothing', async () => {
  await emptyTrials();
  await assert.rejects(seedExp2(exp2Row({ provider: 'sesame' }), SOURCES), /unknown provider "sesame"/);
  assert.equal(await countRows('exp2_trials'), 0);
});

test('Exp 1: hard-fails on a missing or unknown column', async () => {
  await emptyTrials();
  await assert.rejects(
    seedExp1(EXP1_FIXTURE.replace('question_answered', 'answer'), EXP1_STIMULI),
    /missing: question_answered.*unknown: answer/
  );
  assert.equal(await countRows('exp1_trials'), 0);
});

test('Exp 1: hard-fails on Human, which was not in Exp 1', async () => {
  await emptyTrials();
  const bad = EXP1_FIXTURE.replace(',melon,hume,2,', ',melon,human,2,');
  await assert.rejects(seedExp1(bad, EXP1_STIMULI), /not an Exp 1 model/);
  assert.equal(await countRows('exp1_trials'), 0);
});

test('Exp 1: hard-fails on an answer outside the survey options', async () => {
  await emptyTrials();
  const bad = EXP1_FIXTURE.replace('Human,What did Molly mail?,', 'Human,What did Molly eat?,');
  await assert.rejects(seedExp1(bad, EXP1_STIMULI), /not a survey option/);
  assert.equal(await countRows('exp1_trials'), 0);
});

test('the real Exp 2 results seed cleanly: 244 attention checks, every provider an Exp 2 model', async () => {
  await emptyTrials();
  assert.equal(await seedExp2(read('seed/exp2_results.csv'), SOURCES), 7564);
  assert.equal(await attentionChecks(), 244);
  const counts = await getExp2Counts();
  assert.equal(Object.keys(counts).length, 10);
  assert.deepEqual(counts.elevenlabs, { trials: 812, interpN: 806, interpCorrect: 506, natN: 805, natSum: 2913 });
});
