// Text-art backgrounds for the intro page. Pure: each art draws characters into a grid for a
// given size and time, at three brightness levels. The component renders each level as one
// <pre> layer (dim / mid / bright), so a frame costs three text writes, not thousands of spans.

export type Level = 1 | 2 | 3;

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private chars: string[];
  private levels: Uint8Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.chars = new Array(cols * rows).fill(' ');
    this.levels = new Uint8Array(cols * rows);
  }

  /** Writes a character; a brighter level wins over a dimmer one already in the cell. */
  set(x: number, y: number, ch: string, level: Level) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows || ch === ' ') return;
    const i = y * this.cols + x;
    if (level < this.levels[i]) return;
    this.levels[i] = level;
    this.chars[i] = ch;
  }

  text(x: number, y: number, s: string, level: Level) {
    for (let k = 0; k < s.length; k++) this.set(x + k, y, s[k], level);
  }

  /** One string per level, rows joined by newlines; other cells are spaces. */
  layers(): [string, string, string] {
    const out: [string[], string[], string[]] = [[], [], []];
    for (let y = 0; y < this.rows; y++) {
      const rows: [string, string, string] = ['', '', ''];
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const lv = this.levels[i];
        for (let l = 0; l < 3; l++) rows[l] += lv === l + 1 ? this.chars[i] : ' ';
      }
      for (let l = 0; l < 3; l++) out[l].push(rows[l]);
    }
    return [out[0].join('\n'), out[1].join('\n'), out[2].join('\n')];
  }
}

/** A horizontal band the art should leave clear (where the foreground text card sits).
 *  In px for fontSize, converted to rows (top inclusive, bottom exclusive) for draw. */
export interface Avoid {
  top: number;
  bottom: number;
  /** Where the visible area ends, if before the bottom of the box. */
  end?: number;
}

export interface Art {
  /** Font size in px for a container of this size. */
  fontSize: (widthPx: number, heightPx: number, avoid?: Avoid) => number;
  draw: (g: Grid, t: number, avoid?: Avoid) => void;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- 1: drifting sentence field

const PHRASE = 'molly mailed a melon    ';
const WORD_AT: number[] = (() => {
  let w = 0;
  return [...PHRASE].map((ch, i) => {
    if (ch === ' ' && PHRASE[i - 1] !== ' ') w++;
    return ch === ' ' ? -1 : w;
  });
})();

/** The same sentence on every row, rows drifting in alternate directions; words brighten
 *  (and turn upper-case) as waves pass, so the emphasis keeps landing somewhere new. */
export const fieldArt: Art = {
  fontSize: (w) => (w < 500 ? 11 : 13),
  draw(g, t) {
    const L = PHRASE.length;
    for (let y = 0; y < g.rows; y++) {
      const dir = y % 2 === 0 ? 1 : -1;
      const speed = 1.2 + (y % 5) * 0.35;
      const offset = Math.floor(dir * t * speed) + y * 7;
      for (let x = 0; x < g.cols; x++) {
        const p = x + offset;
        const i = mod(p, L);
        const wi = WORD_AT[i];
        if (wi < 0) continue;
        const gid = Math.floor(p / L) * 4 + wi;
        const wave = Math.sin(gid * 0.9 + y * 0.45 - t * 1.3) + 0.6 * Math.sin(gid * 0.23 - y * 0.21 + t * 0.6);
        const level: Level = wave > 1.2 ? 3 : wave > 0.3 ? 2 : 1;
        g.set(x, y, level === 3 ? PHRASE[i].toUpperCase() : PHRASE[i], level);
      }
    }
  },
};

// ---------------------------------------------------------------- 2: focus + pitch contour

const GLYPHS: Record<string, string[]> = {
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
};
const FOCUS_WORDS = ['MOLLY', 'MAILED', 'A', 'MELON'];
const FOCUS_LAYOUTS = [[[0, 1, 2, 3]], [[0, 1], [2, 3]], [[0], [1], [2], [3]]];
/** Rows of pitch-contour space above each line of letters, and the gap between lines: roomy,
 *  then compact for small spaces. */
const FOCUS_BANDS = [
  { band: 7, gap: 2 },
  { band: 4, gap: 1 },
];
const BAND = FOCUS_BANDS[0].band;
/** The words the stress visits as the reader scrolls, in order. */
export const FOCUS_STOPS = [0, 1, 2, 3];

function wordWidth(word: string, pw: number) {
  return word.length * 6 * pw - pw;
}
function lineWidth(words: number[], pw: number) {
  return words.reduce((s, w) => s + wordWidth(FOCUS_WORDS[w], pw), 0) + (words.length - 1) * 4 * pw;
}

/**
 * How much stress each of the four words carries at scroll progress p (0–1). The stress
 * travels MOLLY → MAILED → A → MELON at a steady rate, with no rests in between, so the art changes
 * for as long as the reader keeps scrolling: the word being left falls as the next one rises.
 */
export function focusStress(p: number): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const moves = FOCUS_STOPS.length - 1;
  const x = clamp01(p) * moves;
  const i = Math.min(moves - 1, Math.floor(x));
  const rise = x - i;
  out[FOCUS_STOPS[i]] = 1 - rise;
  out[FOCUS_STOPS[i + 1]] = rise;
  return out;
}

/** One line of block letters with its pitch contour in the `band` rows above it. */
function drawFocusLine(g: Grid, line: number[], pw: number, top: number, band: number, amp: (w: number) => number) {
  const width = lineWidth(line, pw);
  const left = Math.floor((g.cols - width) / 2);
  const letterTop = top + band;
  const centers: { w: number; c: number; half: number }[] = [];
  let x = left;
  for (const w of line) {
    const word = FOCUS_WORDS[w];
    const ww = wordWidth(word, pw);
    centers.push({ w, c: x + ww / 2, half: Math.max(ww / 2, 3 * pw) });
    const a = amp(w);
    const level: Level = a > 0.66 ? 3 : a > 0.33 ? 2 : 1;
    for (let k = 0; k < word.length; k++) {
      const glyph = GLYPHS[word[k]];
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++)
          if (glyph[r][c] === '#') for (let p = 0; p < pw; p++) g.set(x + k * 6 * pw + c * pw + p, letterTop + r, word[k], level);
    }
    x += ww + 4 * pw;
  }
  // Pitch contour: declining baseline plus a bump over the stressed word.
  const lift = band / BAND; // scales the contour to a shorter band
  const height = (cx: number) => {
    const u = (cx - left) / Math.max(1, width);
    let h = (1.6 - 1.0 * u) * lift;
    for (const { w, c, half } of centers) {
      const a = amp(w);
      if (a > 0) h += a * (band - 2.6 * lift) * Math.exp(-(((cx - c) / (half * 0.9)) ** 2));
    }
    return h;
  };
  let prevY: number | null = null;
  for (let cx = left; cx < left + width; cx++) {
    const h = height(cx);
    const slope = height(cx + 1) - height(cx - 1);
    const y = letterTop - 1 - Math.round(h);
    // A steep stretch spans several rows: fill them so the line stays continuous.
    if (prevY !== null && Math.abs(y - prevY) > 1) {
      const up = y < prevY;
      for (let yy: number = prevY + (up ? -1 : 1); yy !== y; yy += up ? -1 : 1) g.set(up ? cx - 1 : cx, yy, up ? '/' : '\\', 2);
    }
    const ch = slope > 0.45 ? '/' : slope < -0.45 ? '\\' : h - Math.floor(h) > 0.5 ? '-' : '_';
    g.set(cx, y, ch, 2);
    prevY = y;
  }
}

const FOCUS_FONT = 10;
const FOCUS_FONT_NARROW = 8.5;
const FOCUS_MIN_FONT = 4;
/** The smallest layout: two lines of two words, single-width letters, compact contour. */
const FOCUS_MIN_COLS = lineWidth([0, 1], 1) + 4;
const FOCUS_MIN_ROWS = 2 * (5 + FOCUS_BANDS[1].band) + FOCUS_BANDS[1].gap + 3;
/** One word per line, double-width letters, compact contour (with slack for rounding). */
const FOCUS_STACKED_COLS = lineWidth([1], 2) + 3;
const FOCUS_STACKED_ROWS = 4 * (5 + FOCUS_BANDS[1].band) + 3 * FOCUS_BANDS[1].gap + 4;
const FOCUS_STACKED_MIN_FONT = 7;

/**
 * "MOLLY MAILED A MELON" in block letters made of their own characters, under a pitch contour
 * drawn in characters that rises over the stressed word, with a gentle declination across the
 * line. Unlike the other arts, its `t` is not time but scroll progress through the step (0–1):
 * the stress moves MOLLY → MAILED → A → MELON as the reader scrolls (see focusStress) and holds
 * still when they stop. With a band to avoid (the text card pinned at the top), everything is drawn
 * in the free space below it.
 */
export const focusArt: Art = {
  fontSize: (w, h, avoid) => {
    const base = w >= 500 ? FOCUS_FONT : FOCUS_FONT_NARROW;
    if (!avoid) return base;
    const space = Math.min(h, avoid.end ?? h) - avoid.bottom;
    if (w < 500) {
      // Tall phones: one word per line in double-width letters reads best, if it fits.
      const stacked = Math.min(base, space / (FOCUS_STACKED_ROWS * 1.2), w / (FOCUS_STACKED_COLS * 0.6));
      if (stacked >= FOCUS_STACKED_MIN_FONT) return stacked;
    }
    // Shrink until the smallest layout fits below the band.
    const fit = Math.min(space / (FOCUS_MIN_ROWS * 1.2), w / (FOCUS_MIN_COLS * 0.6));
    return Math.max(FOCUS_MIN_FONT, Math.min(base, fit));
  },
  draw(g, p, avoid) {
    const stress = focusStress(p);
    const amp = (w: number) => stress[w];
    const regionTop = avoid ? Math.max(0, avoid.bottom) : 0;
    const regionEnd = Math.min(g.rows, avoid?.end ?? g.rows);
    // Keep a row clear of the band and of the bottom edge.
    const rows = regionEnd - regionTop - (avoid ? 2 : 0);

    // The largest layout that fits.
    let chosen: { lines: number[][]; pw: number; band: number; gap: number; h: number } | null = null;
    outer: for (const pw of [2, 1]) {
      for (const lines of FOCUS_LAYOUTS) {
        if (!lines.every((l) => lineWidth(l, pw) <= g.cols - 2)) continue;
        for (const { band, gap } of FOCUS_BANDS) {
          const h = lines.length * (5 + band) + (lines.length - 1) * gap;
          if (h <= rows) {
            chosen = { lines, pw, band, gap, h };
            break outer;
          }
        }
      }
    }
    if (!chosen) return;
    const { lines, pw, band, gap, h } = chosen;
    let top = regionTop + (avoid ? 1 : 0) + Math.floor((rows - h) / 2);
    for (const line of lines) {
      drawFocusLine(g, line, pw, top, band, amp);
      top += 5 + band + gap;
    }
  },
};

// ---------------------------------------------------------------- 3: two groupings

export interface Grouping {
  words: string[];
  /** Index of the first word of the second group, for readings A and B. */
  breakA: number;
  breakB: number;
}

function tokenPositions(words: string[], brk: number): number[] {
  // Tokens: '[', words of group 1, ']', '[', words of group 2, ']'.
  const pos: number[] = [];
  let x = 0;
  pos.push(x); // open 1
  x += 2;
  for (let i = 0; i < words.length; i++) {
    if (i === brk) {
      pos.push(x); // close 1
      x += 5;
      pos.push(x); // open 2
      x += 2;
    }
    pos.push(x);
    x += words[i].length + 1;
  }
  pos.push(x); // close 2
  // Reorder into a fixed token order: open1, close1, open2, close2, words...
  const words0 = pos.filter((_, i) => i !== 0 && i !== brk + 1 && i !== brk + 2 && i !== pos.length - 1);
  return [pos[0], pos[brk + 1], pos[brk + 2], pos[pos.length - 1], ...words0];
}

export const GROUP_PERIOD = 6;

/** The sentence, bracketed into its two groupings, sliding from one to the other and back.
 *  Rows repeat it with a delay so the regrouping ripples outward from the centre row. */
export function groupingArt(gr: Grouping): Art {
  const lengthA = gr.words.join(' ').length + 9;
  return {
    fontSize: (w) => Math.max(9, Math.min(16, Math.floor(w / (lengthA + 6) / 0.6))),
    draw(g, t) {
      const a = tokenPositions(gr.words, gr.breakA);
      const b = tokenPositions(gr.words, gr.breakB);
      const width = Math.max(a[3], b[3]) + 1;
      const left = Math.floor((g.cols - width) / 2);
      const mid = Math.floor(g.rows / 2);
      for (let y = mid % 3; y < g.rows; y += 3) {
        const d = Math.abs(y - mid) / 3;
        const delay = d * 0.18;
        const ph = mod(t - delay, GROUP_PERIOD) / GROUP_PERIOD; // A hold, move, B hold, move
        const m = ph < 0.35 ? 0 : ph < 0.5 ? ease((ph - 0.35) / 0.15) : ph < 0.85 ? 1 : 1 - ease((ph - 0.85) / 0.15);
        const at = (k: number) => left + Math.round(a[k] + (b[k] - a[k]) * m);
        const bracketLevel: Level = d < 1 ? 3 : d < 4 ? 2 : 1;
        const wordLevel: Level = d < 1 ? 2 : 1;
        gr.words.forEach((w, i) => g.text(at(4 + i), y, w, wordLevel));
        // Brackets and pause marks only while a grouping holds; words slide on their own
        // between them, so nothing collides mid-move.
        const holding = m === 0 || m === 1;
        if (holding) {
          g.set(at(0), y, '[', bracketLevel);
          g.set(at(1), y, ']', bracketLevel);
          g.set(at(2), y, '[', bracketLevel);
          g.set(at(3), y, ']', bracketLevel);
        }
        if (holding && d < 4) {
          const gap0 = at(1) + 1;
          const gap1 = at(2);
          for (let x = gap0 + 1; x < gap1 - 1; x++) g.set(x, y, '.', 1);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- 4: oscilloscope

/** A speech-like waveform drawn with characters on a graticule, scrolling past: syllable
 *  envelopes over a fast carrier, filled in ':' with a bright trace at the edges. */
export const waveArt: Art = {
  fontSize: (w) => (w < 500 ? 10 : 12),
  draw(g, t) {
    const mid = Math.floor(g.rows / 2);
    for (let y = 0; y < g.rows; y += 4) for (let x = 0; x < g.cols; x += 8) g.set(x, y, '+', 1);
    for (let x = 0; x < g.cols; x++) g.set(x, mid, '-', 1);
    const maxA = g.rows * 0.4;
    for (let x = 0; x < g.cols; x++) {
      const u = x / g.cols;
      // Syllable-sized bumps riding on a slower phrase envelope, scrolling left.
      const syl = 0.5 + 0.5 * Math.sin(u * 22 - t * 2.4);
      const phrase = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * 4.1 - t * 0.7 + Math.sin(u * 9 + t * 0.3)));
      const env = 0.06 + 0.94 * syl * syl * phrase;
      const carrier = 0.6 + 0.4 * Math.abs(Math.sin(u * 160 - t * 11));
      const a = Math.round(env * carrier * maxA);
      for (let dy = -a; dy <= a; dy++) {
        const edge = Math.abs(dy) === a;
        g.set(x, mid + dy, edge ? (dy < 0 ? "'" : '.') : '|', edge ? 3 : 2);
      }
    }
  },
};

// ---------------------------------------------------------------- 5: listeners answering

const MARKS = ['A', 'B', '1', '2', '3', '4', '5'];
export const LISTEN_CYCLE = 14;

/** A grid of answer boxes, one per listener trial, filling in at random moments with an
 *  answer mark (A/B or a 1–5 rating); just-filled boxes flash bright, then settle. */
export const listenersArt: Art = {
  fontSize: (w) => (w < 500 ? 11 : 13),
  draw(g, t) {
    const cw = 6;
    const ch = 3;
    const nx = Math.floor(g.cols / cw);
    const ny = Math.floor(g.rows / ch);
    const ox = Math.floor((g.cols - nx * cw) / 2) + 1;
    const oy = Math.floor((g.rows - ny * ch) / 2) + 1;
    const cycle = Math.floor(t / LISTEN_CYCLE);
    const local = t - cycle * LISTEN_CYCLE;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = j * 1009 + i + cycle * 7919;
        const fillAt = hash(id) * LISTEN_CYCLE * 0.8;
        const x = ox + i * cw;
        const y = oy + j * ch;
        if (local < fillAt || local > LISTEN_CYCLE * 0.92) {
          g.text(x, y, '[ ]', 1);
        } else {
          const mark = MARKS[Math.floor(hash(id + 1) * MARKS.length)];
          const fresh = local - fillAt < 0.7;
          g.text(x, y, `[${mark}]`, fresh ? 3 : 2);
        }
      }
  },
};
