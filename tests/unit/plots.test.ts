import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { allPlotFiles, plotSrc } from '../../lib/plots.ts';

test('plot paths are built from the picked ids', () => {
  assert.equal(plotSrc(1, ['hume']), '/plots/focus_hume.png');
  assert.equal(plotSrc(2, ['nova_sts', 'old_men']), '/plots/ambiguity_nova_sts_old_men.png');
});

test('every plot the pickers can reach exists in public/plots, and nothing else is there', () => {
  const expected = allPlotFiles();
  assert.equal(expected.length, 8 + 7 * 5);
  for (const f of expected) assert.ok(existsSync(`public${f}`), `missing public${f}`);
  assert.deepEqual(readdirSync('public/plots').sort(), expected.map((f) => f.slice('/plots/'.length)).sort());
});
