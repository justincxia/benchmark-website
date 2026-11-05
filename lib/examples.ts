// Server-only. The example clip per model shown on the experiment pages.

import { getManifest } from './clip-manifest.ts';
import type { Clip } from './clips.ts';
import { modelsIn, type Experiment } from './models.ts';
import { EXP2_CONDITIONS } from './experiments.ts';

export interface ExampleClipRef {
  key: string;
  name: string;
  file: string | null;
}

/** Exp 1: take 1 of the broad condition. Exp 2: the first sentence, interpretation a, take 1. */
export function exampleClips(experiment: Experiment): ExampleClipRef[] {
  let clips: Clip[] = [];
  try {
    clips = getManifest();
  } catch {
    clips = [];
  }
  return modelsIn(experiment).map((m) => {
    const c = clips.find(
      (x) =>
        x.experiment === experiment &&
        x.provider === m.key &&
        x.take === 1 &&
        (experiment === 1 ? x.condition === 'broad' : x.condition === EXP2_CONDITIONS[0] && x.variant === 'a')
    );
    return { key: m.key, name: m.name, file: c?.file ?? null };
  });
}
