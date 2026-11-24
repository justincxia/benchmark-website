// The sound-wave background of the leaderboard: one period of a waveform drawn as vertical
// bars, built so its right edge meets its left edge and it can repeat sideways. Pure.

export const WAVE = {
  /** Width of one repeating period, px. */
  period: 1260,
  /** Height of the band the wave sits in, px. */
  height: 260,
  /** Distance between bar centres, and the bar width, px. */
  pitch: 9,
  bar: 3,
  /** Horizontal px moved per px of page scroll. */
  speed: 0.6,
} as const;

/**
 * Bar heights (px) for one period. Built from sines with whole numbers of cycles per period,
 * so the pattern loops; the slow one shapes it into bursts, like words in speech.
 */
export function waveBars(): number[] {
  const n = WAVE.period / WAVE.pitch;
  const tau = Math.PI * 2;
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const burst = Math.pow(0.5 + 0.5 * Math.sin(tau * 4 * u + 0.6), 1.6);
    const ripple = 0.45 + 0.55 * Math.abs(Math.sin(tau * 31 * u + 1.3));
    const jitter = 0.7 + 0.3 * Math.sin(tau * 53 * u + 2.1);
    const h = 6 + (WAVE.height - 6) * (0.06 + 0.94 * burst) * ripple * jitter;
    return Math.round(h);
  });
}

/** One period as an SVG image (a data URI), bars centred vertically, in the given colour. */
export function waveImage(color: string): string {
  const mid = WAVE.height / 2;
  const rects = waveBars()
    .map((h, i) => {
      const x = i * WAVE.pitch + (WAVE.pitch - WAVE.bar) / 2;
      return `<rect x="${x}" y="${mid - h / 2}" width="${WAVE.bar}" height="${h}" rx="${WAVE.bar / 2}"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WAVE.period}" height="${WAVE.height}" fill="${color}">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
