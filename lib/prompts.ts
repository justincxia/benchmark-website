// The Record tab's prompts. Pure: built from the survey constants and the Exp 2 sentences, so
// the client renders the same list the server allowlists.

import { EXP1_CONDITIONS, EXP1_SENTENCE, INTENDED_QUESTION, type Exp2Sentence } from './experiments.ts';

export interface Prompt {
  /** `exp1-<condition>` or `exp2-<sentence>-<a|b>`. */
  id: string;
  experiment: 1 | 2;
  sentence: string;
  /** Exp 1 focus condition, or Exp 2 sentence id. */
  condition: string;
  /** Exp 2 only. */
  interpretation: 'A' | 'B' | null;
  /** What the reading should convey: the question it answers (Exp 1) or the interpretation (Exp 2). */
  cue: string;
}

export function buildPrompts(sentences: Exp2Sentence[]): Prompt[] {
  const exp1: Prompt[] = EXP1_CONDITIONS.map((c) => ({
    id: `exp1-${c}`,
    experiment: 1,
    sentence: EXP1_SENTENCE,
    condition: c,
    interpretation: null,
    cue: INTENDED_QUESTION[c],
  }));
  const exp2: Prompt[] = sentences.flatMap((s) =>
    (['A', 'B'] as const).map((i) => ({
      id: `exp2-${s.condition}-${i.toLowerCase()}`,
      experiment: 2 as const,
      sentence: s.text,
      condition: s.condition,
      interpretation: i,
      cue: i === 'A' ? s.optionA : s.optionB,
    }))
  );
  return [...exp1, ...exp2];
}
