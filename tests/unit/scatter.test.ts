import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisFor, placeLabels } from '../../lib/scatter.ts';

test('axisFor covers the values on round steps, with room at the edges', () => {
  assert.deepEqual(axisFor([2.99, 3.66], 0.25), { min: 2.75, max: 3.75, ticks: [2.75, 3, 3.25, 3.5, 3.75] });
  // 0.70 sits on a tick, so the axis grows by one step above it.
  const a = axisFor([0.473, 0.7], 0.05);
  assert.equal(a.ticks[0], 0.45);
  assert.equal(a.ticks.at(-1), 0.75);
});

test('placeLabels moves a label that would cover its neighbour', () => {
  const bounds = { x: 0, y: 0, w: 400, h: 300 };
  const labels = placeLabels(
    [
      { x: 100, y: 100, text: 'First model' },
      { x: 110, y: 102, text: 'Second model' },
    ],
    bounds
  );
  const hit = (p: { x: number; y: number; w: number; h: number }, q: typeof p) =>
    p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  const [a, b] = labels.map((l) => l.box);
  assert.ok(!hit(a, b), 'the two labels do not overlap');
  // Neither label covers either point (points are 10 wide).
  for (const box of [a, b])
    for (const [x, y] of [[100, 100], [110, 102]]) assert.ok(!hit(box, { x: x - 5, y: y - 5, w: 10, h: 10 }));
});
