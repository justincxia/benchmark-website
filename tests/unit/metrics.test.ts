import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricRows, formatMean, formatPct, sortRows, DASH, DEFAULT_SORT } from '../../lib/metrics.ts';
import type { Exp1Counts, Exp2Counts } from '../../lib/db.ts';
import { MODELS } from '../../lib/models.ts';

test('formatMean rounds half-up to two decimals', () => {
  assert.equal(formatMean(1394, 400), '3.49'); // 3.485 — naive toFixed gives 3.48
  assert.equal(formatMean(2913, 805), '3.62');
  assert.equal(formatMean(10, 4), '2.50');
  assert.equal(formatMean(0, 0), DASH);
});

test('formatPct rounds half-up to one decimal', () => {
  assert.equal(formatPct(1, 16), '6.3%'); // 6.25
  assert.equal(formatPct(1, 8), '12.5%');
  assert.equal(formatPct(2, 3), '66.7%');
  assert.equal(formatPct(0, 5), '0.0%');
  assert.equal(formatPct(5, 5), '100.0%');
  assert.equal(formatPct(0, 0), DASH);
});

const e1 = (c: Partial<Exp1Counts>): Exp1Counts => ({
  trials: 0, focusN: 0, focusCorrect: 0, natN: 0, natSum: 0, humanAiN: 0, judgedHuman: 0, ...c,
});
const e2 = (c: Partial<Exp2Counts>): Exp2Counts => ({ trials: 0, interpN: 0, interpCorrect: 0, natN: 0, natSum: 0, ...c });

test('a model not in an experiment shows — there, even if counts exist for it', () => {
  const rows = buildMetricRows(
    { human: e1({ focusN: 4, focusCorrect: 4 }), hume: e1({ focusN: 4, focusCorrect: 1, natN: 2, natSum: 7, humanAiN: 4, judgedHuman: 3 }) },
    { elevenlabs_v4: e2({ interpN: 2, interpCorrect: 2 }), hume: e2({ interpN: 3, interpCorrect: 2, natN: 3, natSum: 10 }) }
  );
  const by = Object.fromEntries(rows.map((r) => [r.key, r.metrics]));
  assert.equal(by.human.exp1Focus.display, DASH);
  assert.equal(by.elevenlabs_v4.exp2Interp.display, DASH);
  assert.equal(by.hume.exp1Focus.display, '25.0%');
  assert.equal(by.hume.exp1Nat.display, '3.50');
  assert.equal(by.hume.exp1Human.display, '75.0%');
  assert.equal(by.hume.exp2Interp.display, '66.7%');
  assert.equal(by.hume.exp2Nat.display, '3.33');
  // No data at all for a model in the experiment: — as well.
  assert.equal(by.grok_tts.exp1Focus.display, DASH);
  assert.equal(by.grok_tts.exp1Focus.value, null);
});

test('one row per model, in the model list order', () => {
  const rows = buildMetricRows({}, {});
  assert.deepEqual(rows.map((r) => r.key), MODELS.map((m) => m.key));
});

test('sorting is descending, models without a value last, ties in list order', () => {
  const rows = buildMetricRows(
    {},
    {
      hume: e2({ interpN: 10, interpCorrect: 5 }),
      grok_tts: e2({ interpN: 10, interpCorrect: 9 }),
      human: e2({ interpN: 10, interpCorrect: 5 }),
    }
  );
  const sorted = sortRows(rows, 'exp2Interp').map((r) => r.key);
  assert.deepEqual(sorted.slice(0, 3), ['grok_tts', 'hume', 'human']);
  // The rest have no value; they keep model-list order after the valued rows.
  const rest = MODELS.map((m) => m.key).filter((k) => !['grok_tts', 'hume', 'human'].includes(k));
  assert.deepEqual(sorted.slice(3), rest);
});

test('the default sort is Exp 1 focus accuracy', () => {
  assert.equal(DEFAULT_SORT, 'exp1Focus');
});
