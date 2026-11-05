import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResponseInput } from '../../lib/response-input.ts';
import { loadAllClips } from '../../lib/stimuli.ts';

const clips = loadAllClips();
const exp1 = { participant: 'p', session: 's', round: 0, clip: 'hume_focus_a_3.wav', naturalness: 4, humanOrAi: 'AI', questionAnswered: 'What happened?', listenedMs: 1200 };
const exp2 = { participant: 'p', session: 's', round: 0, clip: 'lisa_b_3.wav', naturalness: 5, interpretation: 'A', listenedMs: 900 };

test('Exp 1: ground truth is derived from the clip, not the body', () => {
  const r = validateResponseInput({ ...exp1, model: 'human', intendedQuestion: 'What happened?' }, clips);
  assert.ok('value' in r);
  assert.equal(r.value.experiment, 1);
  assert.equal(r.value.model, 'hume');
  assert.equal(r.value.condition, 'a');
  assert.equal(r.value.take, 3);
  assert.equal(r.value.intendedQuestion, 'How many melons did Molly mail?');
  assert.equal(r.value.questionAnswered, 'What happened?');
  assert.equal(r.value.interpretation, null);
});

test('Exp 2: ground truth is derived from the clip', () => {
  const r = validateResponseInput(exp2, clips);
  assert.ok('value' in r);
  assert.equal(r.value.experiment, 2);
  assert.equal(r.value.model, 'human');
  assert.equal(r.value.variant, 'b');
  assert.equal(r.value.intendedInterpretation, 'B');
  assert.equal(r.value.humanOrAi, null);
});

test('rejects an unknown clip, including a path', () => {
  for (const clip of ['nope.wav', '../seed/exp2_results.csv', 'Hume Octave Outputs/Focus/hume_focus_a_3.wav']) {
    assert.ok('error' in validateResponseInput({ ...exp1, clip }, clips));
  }
});

test('rejects answers outside the survey options', () => {
  assert.ok('error' in validateResponseInput({ ...exp1, naturalness: 6 }, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, humanOrAi: 'human' }, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, questionAnswered: 'Why?' }, clips));
  assert.ok('error' in validateResponseInput({ ...exp2, interpretation: 'C' }, clips));
});

test('rejects questions that the clip’s experiment does not ask', () => {
  assert.ok('error' in validateResponseInput({ ...exp2, humanOrAi: 'AI' }, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, interpretation: 'A' }, clips));
});

test('rejects malformed identity fields', () => {
  assert.ok('error' in validateResponseInput(null, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, participant: '' }, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, round: -1 }, clips));
  assert.ok('error' in validateResponseInput({ ...exp1, listenedMs: 1.5 }, clips));
});
