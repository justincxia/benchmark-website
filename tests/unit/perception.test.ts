import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenerResultsFromCsv } from '../../lib/perception.ts';
import { DASH } from '../../lib/metrics.ts';

const HEADER = 'experiment,listener,run,file,condition,sentence,expected,detected,match';

test('listener accuracy pools runs per experiment; missing task shows —', () => {
  const csv = [
    HEADER,
    '1,hume-evi,1,human_broad_1.wav,broad,,broad,broad,1',
    '1,hume-evi,2,human_broad_1.wav,broad,,broad,molly,0',
    '1,hume-evi,1,human_narrow_molly_1.wav,molly,,molly,broad,0',
    '1,hume-evi,2,human_narrow_molly_1.wav,molly,,molly,broad,0',
    '2,hume-evi,1,lisa_a_1.wav,a,lisa,a,a,1',
    '2,human,1,lisa_a_1.wav,a,lisa,a,a,1',
    '2,human,2,lisa_a_1.wav,a,lisa,a,b,0',
    '2,human,3,lisa_b_1.wav,b,lisa,b,b,1',
  ].join('\n');
  const { rows, counts } = listenerResultsFromCsv(csv);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.metrics]));
  assert.deepEqual(rows.map((r) => r.key), ['human', 'hume-evi']);
  assert.equal(by['hume-evi'].listenFocus.display, '25.0%');
  assert.equal(by['hume-evi'].listenInterp.display, '100.0%');
  assert.equal(by.human.listenFocus.display, DASH);
  assert.equal(by.human.listenInterp.display, '66.7%');
  assert.equal(by.human.exp1Focus.display, DASH);
  assert.deepEqual(counts['1']['hume-evi'], { n: 4, correct: 1, runs: 2, recordings: 2 });
});

test('unknown listener or header is rejected', () => {
  assert.throws(() => listenerResultsFromCsv('a,b\n1,2'));
  assert.throws(() => listenerResultsFromCsv(`${HEADER}\n1,mystery,1,x.wav,broad,,broad,broad,1`));
});
