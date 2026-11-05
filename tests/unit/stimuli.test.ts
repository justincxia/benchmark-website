import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllClips, loadExp2Sentences } from '../../lib/stimuli.ts';
import { buildBlock, cellOf, seeded, intendedInterpretationOf, intendedQuestionOf } from '../../lib/clips.ts';
import { modelsIn } from '../../lib/models.ts';
import { EXP1_CONDITIONS, EXP2_CONDITIONS } from '../../lib/experiments.ts';

const clips = loadAllClips();

test('the stimulus lists name 250 Exp 1 clips and 510 Exp 2 clips with unique basenames', () => {
  assert.equal(clips.filter((c) => c.experiment === 1).length, 250); // 10 models × 5 conditions × 5 takes
  assert.equal(clips.filter((c) => c.experiment === 2).length, 510); // 9 × 5 × 2 × 5 + Human's 6 takes
  assert.equal(new Set(clips.map((c) => c.file)).size, clips.length);
});

test('Exp 2 clips cover only the five baseline sentences', () => {
  assert.deepEqual(
    [...new Set(clips.filter((c) => c.experiment === 2).map((c) => c.condition))].sort(),
    [...EXP2_CONDITIONS].sort()
  );
});

test('the Exp 2 sentences load in stimulus order with both readings', () => {
  const s = loadExp2Sentences();
  assert.equal(s.length, 5);
  assert.equal(s[0].condition, 'servant_actress');
  assert.match(s[3].optionB, /taken by David/);
});

test('Exp 1 block: every model × condition exactly once', () => {
  const block = buildBlock(clips, 1, seeded(7));
  assert.equal(block.length, modelsIn(1).length * EXP1_CONDITIONS.length);
  assert.equal(new Set(block.map(cellOf)).size, block.length);
  assert.ok(block.every((c) => c.experiment === 1));
});

test('Exp 2 block: every model × sentence × interpretation once, grouped by sentence', () => {
  const block = buildBlock(clips, 2, seeded(11));
  assert.equal(block.length, modelsIn(2).length * EXP2_CONDITIONS.length * 2);
  assert.equal(new Set(block.map(cellOf)).size, block.length);
  // Each sentence's recordings are contiguous, so the sentence screen is shown once per sentence.
  const runs = block.map((c) => c.condition).filter((c, i, a) => i === 0 || a[i - 1] !== c);
  assert.equal(runs.length, 5);
});

test('blocks are reproducible for a seed and differ across seeds', () => {
  const a = buildBlock(clips, 1, seeded(3)).map((c) => c.file);
  assert.deepEqual(buildBlock(clips, 1, seeded(3)).map((c) => c.file), a);
  assert.notDeepEqual(buildBlock(clips, 1, seeded(4)).map((c) => c.file), a);
});

test('ground truth comes from the clip', () => {
  const melon = clips.find((c) => c.file === 'hume_focus_melon_2.wav')!;
  assert.equal(intendedQuestionOf(melon), 'What did Molly mail?');
  const b = clips.find((c) => c.file === 'lisa_b_3.wav')!;
  assert.equal(b.provider, 'human');
  assert.equal(intendedInterpretationOf(b), 'B');
});
