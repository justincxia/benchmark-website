import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAVE, waveBars, waveImage } from '../../lib/wave.ts';

test('the wave fills one period with bars that fit the band and vary like speech', () => {
  const bars = waveBars();
  assert.equal(bars.length, WAVE.period / WAVE.pitch);
  assert.ok(Number.isInteger(bars.length), 'a whole number of bars, so the period repeats cleanly');
  for (const h of bars) assert.ok(h >= 6 && h <= WAVE.height);
  assert.ok(Math.max(...bars) > WAVE.height * 0.7, 'has loud stretches');
  assert.ok(bars.filter((h) => h < 30).length > bars.length * 0.15, 'has quiet stretches');
});

test('the wave image is an SVG data URI in the given colour', () => {
  const img = waveImage('#e4e4e7');
  assert.match(img, /^url\("data:image\/svg\+xml,/);
  assert.ok(decodeURIComponent(img).includes('fill="#e4e4e7"'));
});
