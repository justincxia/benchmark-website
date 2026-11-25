import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExp1Results } from '../../scripts/build-exp1-results.ts';
import { parseExp1Results } from '../../scripts/seed.ts';

const STIMULI = readFileSync('seed/exp1_stimuli.csv', 'utf8');
const HEADER =
  'participantID,experiment,trialNumber,presentationOrder,condition,intendedQuestion,stimulusText,provider,audioTake,audioFile,replays,isAttentionCheck,correctAnswer,naturalness_rating,human_or_ai,question_answered,attentionCheckResponse,finalDistractionRating';
const session = (id: string) =>
  [
    HEADER,
    `${id},focus,52,1,attention_check,,,,,,,true,What happened?,,,,What happened?,`,
    `${id},focus,20,2,melon,What did Molly mail?,Molly mailed a melon.,gemini_live,1,Gemini 3.1 Flash Live Outputs/Focus/gemini_live_focus_melon_1.wav,0,false,,"3 - In between unnatural and natural",AI,What did Molly mail?,,`,
    `${id},focus,53,3,broad,What happened?,Molly mailed a melon.,human,9,Human Outputs/Focus/human_focus_broad_9.wav,2,false,,4 - Mostly natural,Human,What happened?,,`,
  ].join('\n');

test('in-person sessions become a seedable Exp 1 CSV: pilot and human rows dropped, IDs prefixed', () => {
  const res = buildExp1Results([session('1'), session('2')], new Set(['1']), STIMULI);
  assert.deepEqual(res.participants, ['2']);
  assert.equal(res.trials, 1);
  assert.equal(res.droppedHuman, 1);
  const rows = parseExp1Results(res.csv, STIMULI);
  assert.deepEqual(rows.map((r) => r.participant), ['inperson-2', 'inperson-2']);
  assert.equal(rows[1].provider, 'gemini_live');
  assert.equal(rows[1].naturalness, 3);
  assert.ok(!res.csv.includes('presentationOrder'));
});
