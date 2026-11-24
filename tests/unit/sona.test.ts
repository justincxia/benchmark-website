import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBlock, cellOf, seeded } from '../../lib/clips.ts';
import { EXP1_CONDITIONS } from '../../lib/experiments.ts';
import { modelsIn } from '../../lib/models.ts';
import { loadAllClips } from '../../lib/stimuli.ts';
import {
  backoffMs,
  checkTrialClip,
  completionRedirectUrl,
  estimateMinutes,
  normalizeSonaId,
  sameContact,
  SONA_TRIALS,
  validateContact,
  volumeCheckClip,
} from '../../lib/sona.ts';
import { exp1Durations, readWavDuration } from '../../lib/sona-duration.ts';
import { toneWav, wavDurationSec } from '../../lib/wav.ts';
import { writeTestWav } from '../fixtures/make-audio.ts';

const all = loadAllClips();

test('a SONA block is 50 Exp 1 clips covering every model × condition exactly once', () => {
  const cells = new Set(modelsIn(1).flatMap((m) => EXP1_CONDITIONS.map((c) => `${m.key}|${c}`)));
  assert.equal(cells.size, SONA_TRIALS);
  for (const seed of [1, 2, 12345, 2147483646]) {
    const block = buildBlock(all, 1, seeded(seed));
    assert.equal(block.length, SONA_TRIALS);
    assert.ok(block.every((c) => c.experiment === 1));
    const seen = block.map(cellOf);
    assert.equal(new Set(seen).size, SONA_TRIALS, 'no cell twice');
    assert.deepEqual(new Set(seen), cells);
  }
});

test('an answer must be for the clip at its trial index', () => {
  const block = ['a.wav', 'b.wav', 'c.wav'];
  assert.equal(checkTrialClip(block, 0, 'a.wav'), null);
  assert.equal(checkTrialClip(block, 2, 'c.wav'), null);
  assert.match(String(checkTrialClip(block, 1, 'a.wav')), /does not match trial 1/);
  assert.match(String(checkTrialClip(block, 0, 'zzz.wav')), /does not match/);
  for (const bad of [-1, 3, 50, 1.5, '0', null, undefined]) {
    assert.match(String(checkTrialClip(block, bad, 'a.wav')), /trialIndex must be an integer from 0 to 2/);
  }
  assert.match(String(checkTrialClip(block, 0, 7)), /clip must be a string/);
});

test('the completion URL replaces %SURVEY_CODE% with the URL-encoded SONA id', () => {
  const tpl = 'https://upenn.sona-systems.com/webstudy_credit.aspx?experiment_id=1&credit_token=abc&survey_code=%SURVEY_CODE%';
  assert.equal(completionRedirectUrl(tpl, '12345'), tpl.replace('%SURVEY_CODE%', '12345'));
  assert.equal(completionRedirectUrl(tpl, 'a b&c=d/é'), tpl.replace('%SURVEY_CODE%', 'a%20b%26c%3Dd%2F%C3%A9'));
  assert.equal(completionRedirectUrl('x?a=%SURVEY_CODE%&b=%SURVEY_CODE%', '7'), 'x?a=7&b=7');
  assert.equal(completionRedirectUrl(tpl, null), null);
  assert.equal(completionRedirectUrl(tpl, ''), null);
  assert.equal(completionRedirectUrl(null, '1'), null);
  assert.equal(completionRedirectUrl('', '1'), null);
});

test('the time estimate: mean clip × trials + 15 s per trial, rounded up to minutes', () => {
  // 50 × 1.9 + 50 × 15 = 845 s = 14.08 min → 15.
  assert.equal(estimateMinutes([1.9, 1.9]), 15);
  assert.equal(estimateMinutes([]), 15); // the 1.9 s fallback
  assert.equal(estimateMinutes([NaN, -1, 0, Infinity]), 15);
  // 50 × 0.6 + 750 = 780 s = exactly 13 min.
  assert.equal(estimateMinutes([0.6]), 13);
  // 50 × 3 + 750 = 900 s = 15; a hair more rounds up.
  assert.equal(estimateMinutes([3]), 15);
  assert.equal(estimateMinutes([3.01]), 16);
  assert.equal(estimateMinutes([1, 3]), estimateMinutes([2]));
  assert.equal(estimateMinutes([2], 3), Math.ceil((6 + 45) / 60));
});

test('the WAV parser reads the duration from the header', () => {
  assert.equal(wavDurationSec(toneWav(1)), 1);
  assert.equal(wavDurationSec(toneWav(0.25, 440, 8000)), 0.25);
  // Only the header is needed.
  assert.equal(wavDurationSec(toneWav(2).subarray(0, 44)), 2);
  // A LIST chunk (odd size, padded) before `fmt ` and `data`.
  const tone = toneWav(0.5);
  const list = new Uint8Array([...new TextEncoder().encode('LIST'), 3, 0, 0, 0, 1, 2, 3, 0]);
  const withList = new Uint8Array([...tone.subarray(0, 12), ...list, ...tone.subarray(12)]);
  assert.equal(wavDurationSec(withList), 0.5);
  // A streaming writer's placeholder data size falls back to the file size.
  const streamed = toneWav(1).slice();
  new DataView(streamed.buffer).setUint32(40, 0xffffffff, true);
  assert.equal(wavDurationSec(streamed, streamed.length), 1);
  assert.equal(wavDurationSec(streamed.subarray(0, 44), streamed.length), 1);
  // Not WAVs.
  assert.equal(wavDurationSec(new Uint8Array(0)), null);
  assert.equal(wavDurationSec(new TextEncoder().encode('ID3\u0004 not a wav at all')), null);
  assert.equal(wavDurationSec(toneWav(1).subarray(0, 30)), null);
});

test('durations are read from the Exp 1 WAVs on disk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sona-dur-'));
  try {
    const e1 = all.filter((c) => c.experiment === 1).slice(0, 3);
    for (const [i, c] of e1.entries()) {
      mkdirSync(path.dirname(path.join(dir, c.relPath)), { recursive: true });
      writeTestWav(path.join(dir, c.relPath), 0.5 * (i + 1));
    }
    const e2 = all.find((c) => c.experiment === 2 && c.file.endsWith('.wav'))!;
    mkdirSync(path.dirname(path.join(dir, e2.relPath)), { recursive: true });
    writeTestWav(path.join(dir, e2.relPath), 9);
    writeFileSync(path.join(dir, 'junk.wav'), 'nope');
    assert.equal(readWavDuration(path.join(dir, 'junk.wav')), null);
    assert.equal(readWavDuration(path.join(dir, 'missing.wav')), null);
    assert.deepEqual(exp1Durations(dir, [...e1, e2]), [0.5, 1, 1.5]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the volume-check clip is never an Exp 1 trial', () => {
  const v = volumeCheckClip(all)!;
  assert.equal(v.experiment, 2);
  assert.equal(v.provider, 'human');
  assert.equal(volumeCheckClip([...all].reverse())!.file, v.file, 'deterministic');
  assert.equal(volumeCheckClip(all.filter((c) => c.experiment === 1)), null);
});

test('contacts: name and email are required and checked', () => {
  assert.deepEqual(validateContact({ name: ' Ada ', email: ' ada@example.edu ' }), {
    value: { name: 'Ada', email: 'ada@example.edu' },
  });
  for (const bad of [null, 'x', {}, { name: 'Ada' }, { email: 'a@b.co' }, { name: '  ', email: 'a@b.co' },
    { name: 'Ada', email: 'not-an-email' }, { name: 'Ada', email: 'a@b' }, { name: 'x'.repeat(201), email: 'a@b.co' },
    { name: 'Ada', email: `${'x'.repeat(320)}@b.co` }]) {
    assert.ok('error' in validateContact(bad), JSON.stringify(bad));
  }
  assert.ok(sameContact({ name: 'Ada', email: 'ADA@x.edu' }, { name: 'Ada ', email: 'ada@x.edu' }));
  assert.ok(!sameContact({ name: 'Ada', email: 'ada@x.edu' }, { name: 'Bob', email: 'ada@x.edu' }));
});

test('SONA ids are trimmed and capped; retries back off exponentially to 30 s', () => {
  assert.equal(normalizeSonaId(' 123 '), '123');
  assert.equal(normalizeSonaId(''), null);
  assert.equal(normalizeSonaId(42), null);
  assert.equal(normalizeSonaId('x'.repeat(500))!.length, 100);
  assert.deepEqual([0, 1, 2, 3, 10, 50].map(backoffMs), [500, 1000, 2000, 4000, 30000, 30000]);
});
