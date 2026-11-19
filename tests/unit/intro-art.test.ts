import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, fieldArt, focusArt, focusStress, groupingArt, listenersArt, waveArt } from '../../lib/intro-art.ts';

const arts = {
  field: fieldArt,
  focus: focusArt,
  grouping: groupingArt({ words: 'Lisa saw the man with the telescope'.split(' '), breakA: 4, breakB: 2 }),
  wave: waveArt,
  listeners: listenersArt,
};

for (const [name, art] of Object.entries(arts)) {
  test(`${name}: fills exactly the grid, at every size, with printable characters`, () => {
    for (const [cols, rows] of [[62, 70], [133, 59], [213, 66], [10, 5]]) {
      const g = new Grid(cols, rows);
      art.draw(g, 3.7);
      const layers = g.layers();
      for (const layer of layers) {
        const lines = layer.split('\n');
        assert.equal(lines.length, rows);
        for (const l of lines) assert.equal(l.length, cols);
        assert.match(layer, /^[\x20-\x7e\n]*$/);
      }
      // Each cell is drawn in at most one layer.
      for (let i = 0; i < layers[0].length; i++) {
        const lit = layers.filter((l) => l[i] !== ' ' && l[i] !== '\n').length;
        assert.ok(lit <= 1);
      }
    }
  });

  // The focus art is driven by scroll progress, not time: see its own tests below.
  if (art === focusArt) continue;

  test(`${name}: animates (frames differ over time) and is deterministic for a time`, () => {
    const at = (t: number) => {
      const g = new Grid(120, 60);
      art.draw(g, t);
      return g.layers().join('|');
    };
    assert.equal(at(5), at(5));
    assert.notEqual(at(1), at(4.3));
  });
}

test('the grouping art shows each reading in turn', () => {
  const art = arts.grouping;
  const centre = (t: number) => {
    const g = new Grid(80, 9);
    art.draw(g, t);
    const [, mid, bright] = g.layers().map((l) => l.split('\n')[4]);
    return [...bright].map((c, i) => (c !== ' ' ? c : mid[i])).join('').replace(/\s+/g, ' ').trim();
  };
  assert.equal(centre(1), '[ Lisa saw the man ] [ with the telescope ]');
  assert.equal(centre(4), '[ Lisa saw ] [ the man with the telescope ]');
});

const lettersByRow = (g: Grid) => {
  const rows = g.layers().map((l) => l.split('\n'));
  return (r: number) => rows.map((l) => l[r].replace(/[^MOLYAIEDN]/g, '')).join('');
};
/** The letters drawn at the brightest level: the stressed word's. */
const brightLetters = (p: number) => {
  const g = new Grid(213, 62);
  focusArt.draw(g, p);
  return new Set(g.layers()[2].replace(/[^MOLYAIEDN]/g, ''));
};

test('focus stress follows scroll progress: MOLLY, then MAILED, then A, then MELON', () => {
  assert.deepEqual(focusStress(0), [1, 0, 0, 0]);
  assert.deepEqual(focusStress(1 / 3).map((v) => Math.round(v * 1e6) / 1e6), [0, 1, 0, 0]);
  assert.deepEqual(focusStress(2 / 3).map((v) => Math.round(v * 1e6) / 1e6), [0, 0, 1, 0]);
  assert.deepEqual(focusStress(1), [0, 0, 0, 1]);
  // Out-of-range progress is clamped.
  assert.deepEqual(focusStress(-3), [1, 0, 0, 0]);
  assert.deepEqual(focusStress(7), [0, 0, 0, 1]);
  let prev = focusStress(0);
  for (let i = 1; i <= 200; i++) {
    const s = focusStress(i / 200);
    assert.ok(Math.abs(s[0] + s[1] + s[2] + s[3] - 1) < 1e-9, 'the stress is always shared out in full');
    // It only ever moves forward: MOLLY falls, MELON rises.
    assert.ok(s[0] <= prev[0] + 1e-9);
    assert.ok(s[3] >= prev[3] - 1e-9);
    prev = s;
  }
  // Half-way through a move, both words carry some stress.
  const mid = focusStress(0.15);
  assert.ok(mid[0] > 0 && mid[1] > 0);
  // No rests: every bit of scrolling changes the stress, right from the start to the end.
  for (let i = 0; i < 100; i++) assert.notDeepEqual(focusStress(i / 100), focusStress((i + 1) / 100));
});

test('focus art: the same progress gives the same frame, and the bright word moves with it', () => {
  const at = (p: number) => {
    const g = new Grid(213, 62);
    focusArt.draw(g, p);
    return g.layers().join('|');
  };
  assert.equal(at(0.5), at(0.5));
  assert.notEqual(at(0), at(0.5));
  assert.notEqual(at(0.5), at(1));
  assert.deepEqual([...brightLetters(0)].sort(), [...'LMOY'].sort());
  assert.deepEqual([...brightLetters(1 / 3)].sort(), [...'ADEILM'].sort());
  assert.deepEqual([...brightLetters(2 / 3)].sort(), ['A']);
  assert.deepEqual([...brightLetters(1)].sort(), [...'ELMNO'].sort());
});

test('focus art with a card pinned at the top: all four words are drawn below it', () => {
  for (const [cols, rows, bottom] of [[213, 62, 23], [73, 72, 35], [73, 60, 35], [79, 79, 38]]) {
    const g = new Grid(cols, rows);
    const avoid = { top: 0, bottom, end: rows };
    focusArt.draw(g, 0.5, avoid);
    const lettersAt = lettersByRow(g);
    for (let r = 0; r < bottom; r++) assert.equal(lettersAt(r), '', `${cols}x${rows}: row ${r} is behind the card`);
    const below = Array.from({ length: rows - bottom }, (_, r) => lettersAt(bottom + r)).join('');
    for (const ch of 'MOLYAIEDN') assert.ok(below.includes(ch), `${cols}x${rows}: ${ch} is drawn below the card`);
  }
});

test('focus art font: full size when there is room, smaller when the space below the card is tight', () => {
  assert.equal(focusArt.fontSize(1280, 744), 10);
  assert.equal(focusArt.fontSize(1280, 744, { top: 0, bottom: 270 }), 10);
  const tight = focusArt.fontSize(375, 611, { top: 0, bottom: 480 });
  assert.ok(tight < 8.5 && tight >= 4);
});
