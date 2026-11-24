// The acoustic plots shown under the leaderboard. The images are copies of PURM/plots/*.png
// kept in public/plots, renamed to the model keys in lib/models.ts. Pure — client-safe.

import { modelByKey, type Experiment } from './models.ts';

export interface PlotOption {
  id: string;
  label: string;
}

export interface PlotPicker {
  label: string;
  options: PlotOption[];
}

export interface PlotSet {
  /** One row of choices each; a plot exists for every combination. */
  pickers: PlotPicker[];
  width: number;
  height: number;
}

const model = (key: string): PlotOption => ({ id: key, label: modelByKey(key)?.name ?? key });

/** Models with a focus plot (duration, pitch and intensity per word, by focus condition). */
const FOCUS_MODELS = ['elevenlabs', 'gemini_tts', 'gemini_live', 'openai_tts', 'openai_sts', 'hume', 'grok_tts', 'human'];

/** Models with ambiguity boundary-cue plots, one per sentence. */
const AMBIGUITY_MODELS = ['gemini_tts', 'openai_tts', 'hume', 'grok_tts', 'grok_sts', 'nova_sts', 'human'];

/** Sentence ids as the plotting script names them, with the words that identify each sentence. */
const AMBIGUITY_SENTENCES: PlotOption[] = [
  { id: 'servant', label: 'Servant of the actress' },
  { id: 'lisa', label: 'Lisa and the telescope' },
  { id: 'david', label: 'Mirror in the hallway' },
  { id: 'old_men', label: 'Old men and women' },
  { id: 'knife', label: 'Knife, towel and box' },
];

export const PLOTS: Record<Experiment, PlotSet> = {
  1: { pickers: [{ label: 'Model', options: FOCUS_MODELS.map(model) }], width: 2550, height: 750 },
  2: {
    pickers: [
      { label: 'Model', options: AMBIGUITY_MODELS.map(model) },
      { label: 'Sentence', options: AMBIGUITY_SENTENCES },
    ],
    width: 1500,
    height: 480,
  },
};

/** Path under public/ of the plot for one choice per picker. */
export function plotSrc(experiment: Experiment, ids: string[]): string {
  return `/plots/${experiment === 1 ? 'focus' : 'ambiguity'}_${ids.join('_')}.png`;
}

/** Every plot file the site expects, for the test that checks they exist. */
export function allPlotFiles(): string[] {
  const out: string[] = [];
  for (const experiment of [1, 2] as const) {
    const combos = PLOTS[experiment].pickers.reduce<string[][]>(
      (acc, p) => acc.flatMap((ids) => p.options.map((o) => [...ids, o.id])),
      [[]]
    );
    for (const ids of combos) out.push(plotSrc(experiment, ids));
  }
  return out;
}
