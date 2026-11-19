// Layout maths for the scatter chart (one metric against another, a point per model).
// Pure, so the unit tests can check it without a browser.

export interface Axis {
  min: number;
  max: number;
  ticks: number[];
}

/** An axis that covers the values with a little room, on round tick steps. */
export function axisFor(values: number[], step: number): Axis {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  // Keep points off the frame: widen by a step when a value sits on the edge.
  if (lo - min < step * 0.15) min -= step;
  if (max - hi < step * 0.15) max += step;
  const ticks: number[] = [];
  for (let i = 0; i <= Math.round((max - min) / step); i++) ticks.push(Math.round((min + i * step) * 1e6) / 1e6);
  return { min, max, ticks };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedLabel {
  /** Left edge and text baseline of the label. */
  x: number;
  y: number;
  box: Box;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Puts each point's label beside it without covering another label or point: tries right,
 * left, above, below, then the four diagonals, and takes the first free spot inside `bounds` (right if none is).
 */
export function placeLabels(
  points: Array<{ x: number; y: number; text: string }>,
  bounds: Box,
  { charWidth = 6.5, height = 18, gap = 8, radius = 5 } = {}
): PlacedLabel[] {
  const taken: Box[] = points.map((p) => ({ x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 }));
  return points.map((p) => {
    const w = p.text.length * charWidth;
    const candidates: Box[] = [
      { x: p.x + gap, y: p.y - height / 2, w, h: height },
      { x: p.x - gap - w, y: p.y - height / 2, w, h: height },
      { x: p.x - w / 2, y: p.y - gap - height, w, h: height },
      { x: p.x - w / 2, y: p.y + gap, w, h: height },
      { x: p.x + gap, y: p.y - height, w, h: height },
      { x: p.x + gap, y: p.y, w, h: height },
      { x: p.x - gap - w, y: p.y - height, w, h: height },
      { x: p.x - gap - w, y: p.y, w, h: height },
    ];
    const inside = (b: Box) =>
      b.x >= bounds.x && b.x + b.w <= bounds.x + bounds.w && b.y >= bounds.y && b.y + b.h <= bounds.y + bounds.h;
    const box = candidates.find((b) => inside(b) && !taken.some((o) => overlaps(b, o))) ?? candidates[0];
    taken.push(box);
    return { x: box.x, y: box.y + height - 5.5, box };
  });
}
