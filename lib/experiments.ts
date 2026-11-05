// Survey wording and design constants, copied from the two PCIbex surveys
// (TTS Focus Task/data_includes/main.js and TTS MOS Task_copy/data_includes/main.js).
// Pure — imported by the arena client component, the seeder and the validators.

export const NATURALNESS_PROMPT = 'Rate the naturalness by pressing one of the following keys:';
export const NATURALNESS_OPTIONS = [
  '1 - Completely unnatural',
  '2 - Mostly unnatural',
  '3 - In between unnatural and natural',
  '4 - Mostly natural',
  '5 - Completely natural',
] as const;

// ---- Experiment 1: prosodic focus ----

export const EXP1_SENTENCE = 'Molly mailed a melon.';
export const EXP1_CONDITIONS = ['broad', 'molly', 'mailed', 'a', 'melon'] as const;
export type Exp1Condition = (typeof EXP1_CONDITIONS)[number];

export const HUMAN_AI_PROMPT = 'Was this voice produced by a human speaker or an AI system?';
export const HUMAN_AI_OPTIONS = ['Human', 'AI'] as const;
export type HumanOrAi = (typeof HUMAN_AI_OPTIONS)[number];

export const QUESTION_PROMPT = 'What question does this sentence answer?';
/** Display order, as in the survey. */
export const QUESTION_OPTIONS = [
  'Who mailed a melon?',
  'What did Molly do with the melon?',
  'How many melons did Molly mail?',
  'What did Molly mail?',
  'What happened?',
] as const;

/** The correct answer for each focus condition — the survey logs it as `intendedQuestion`. */
export const INTENDED_QUESTION: Record<Exp1Condition, string> = {
  molly: QUESTION_OPTIONS[0],
  mailed: QUESTION_OPTIONS[1],
  a: QUESTION_OPTIONS[2],
  melon: QUESTION_OPTIONS[3],
  broad: QUESTION_OPTIONS[4],
};

// ---- Experiment 2: syntactic ambiguity (ambiguityBaseline) ----

export const EXP2_CONDITIONS = [
  'servant_actress',
  'lisa_telescope',
  'mirror_hallway',
  'old_men_women',
  'knife_towel_box',
] as const;
export type Exp2Condition = (typeof EXP2_CONDITIONS)[number];

export const INTERPRETATION_PROMPT = 'Which interpretation did the speaker intend?';
export type Interpretation = 'A' | 'B';

/** A sentence and its two readings, from seed/exp2_stimuli.csv. */
export interface Exp2Sentence {
  condition: string;
  text: string;
  optionA: string;
  optionB: string;
}

export function isExp1Condition(c: string): c is Exp1Condition {
  return (EXP1_CONDITIONS as readonly string[]).includes(c);
}

export function isExp2Condition(c: string): c is Exp2Condition {
  return (EXP2_CONDITIONS as readonly string[]).includes(c);
}
