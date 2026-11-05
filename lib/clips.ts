// A stimulus clip and the arena's block construction. Pure — no Node builtins, because the
// arena client component imports this module. Where clips come from (the stimulus CSVs
// joined against AUDIO_DIR) lives in lib/stimuli.ts and lib/clip-manifest.ts.

import type { Experiment } from './models.ts';
import { INTENDED_QUESTION, type Exp1Condition, type Interpretation } from './experiments.ts';

export interface Clip {
  /** Basename, e.g. `hume_focus_melon_3.wav`. Unique across the corpus (the manifest asserts
   *  it) and the only thing a client ever names. */
  file: string;
  /** Path relative to AUDIO_DIR, same layout as the tts-sts-audio repo. Server-side only in
   *  practice, but harmless to ship: it is built from the CSVs, never from request input. */
  relPath: string;
  experiment: Experiment;
  provider: string;
  /** Exp 1: focus condition. Exp 2: sentence id. */
  condition: string;
  /** Exp 2 only: intended interpretation variant, 'a' or 'b'. */
  variant: 'a' | 'b' | null;
  take: number;
}

/** What the arena client receives: everything but the on-disk path. */
export type ClipInfo = Omit<Clip, 'relPath'>;

/** Ground truth for an Exp 1 clip: the question its focus condition answers. */
export function intendedQuestionOf(clip: ClipInfo): string | null {
  return clip.experiment === 1 ? INTENDED_QUESTION[clip.condition as Exp1Condition] ?? null : null;
}

/** Ground truth for an Exp 2 clip: A for variant a, B for variant b. */
export function intendedInterpretationOf(clip: ClipInfo): Interpretation | null {
  if (clip.experiment !== 2 || !clip.variant) return null;
  return clip.variant === 'a' ? 'A' : 'B';
}

/** The cell a balanced block covers exactly once: Exp 1 model × condition; Exp 2 model ×
 *  sentence × interpretation. */
export function cellOf(clip: ClipInfo): string {
  return clip.experiment === 1
    ? `${clip.provider}|${clip.condition}`
    : `${clip.provider}|${clip.condition}|${clip.variant}`;
}

export function seeded(s: number) {
  let x = (s * 2654435761) % 2147483647;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** One random take per cell, cells sorted first so the result depends only on `rnd`. */
function drawCells<T extends ClipInfo>(clips: T[], rnd: () => number): T[] {
  const byCell = new Map<string, T[]>();
  for (const c of clips) {
    const takes = byCell.get(cellOf(c));
    if (takes) takes.push(c);
    else byCell.set(cellOf(c), [c]);
  }
  return [...byCell.keys()].sort().map((cell) => {
    const takes = byCell.get(cell)!.slice().sort((a, b) => a.take - b.take);
    return takes[Math.floor(rnd() * takes.length)];
  });
}

/**
 * One balanced block for an experiment: every cell exactly once with a random take, shuffled.
 *
 * Exp 2 is additionally grouped by sentence, as the survey is: the sentence order is shuffled
 * and each sentence's recordings are shuffled within it, so the sentence-and-interpretations
 * screen can be shown once before each sentence's recordings.
 *
 * `rnd` returns a float in [0,1). Pass `seeded(n)` for a reproducible block.
 */
export function buildBlock<T extends ClipInfo>(clips: T[], experiment: Experiment, rnd: () => number): T[] {
  const drawn = drawCells(
    clips.filter((c) => c.experiment === experiment),
    rnd
  );
  if (experiment === 1) return shuffle(drawn, rnd);

  const bySentence = new Map<string, T[]>();
  for (const c of drawn) {
    const g = bySentence.get(c.condition);
    if (g) g.push(c);
    else bySentence.set(c.condition, [c]);
  }
  const order = shuffle([...bySentence.keys()].sort(), rnd);
  return order.flatMap((s) => shuffle(bySentence.get(s)!, rnd));
}

function hashFile(file: string): number {
  let h = 2166136261;
  for (let i = 0; i < file.length; i++) {
    h ^= file.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 48 decorative waveform-bar heights, stable for a given filename. Deliberately synthetic:
 * real peak data would show the accented word and let a listener answer by looking.
 */
export function clipBars(file: string): number[] {
  const rnd = seeded((hashFile(file) % 65535) + 1);
  return Array.from({ length: 48 }, (_, k) => {
    const env = Math.sin((k / 48) * Math.PI);
    return 0.16 + env * (0.35 + rnd() * 0.55);
  });
}
