// Validates an arena submission. Ground truth (model, condition, variant, take, intended
// answer) comes from the clip, looked up in the server's own manifest — never from the request
// body. The client can say which clip it heard, not what the clip is. Pure: `clips` is passed
// in so this is testable without a filesystem.

import { QUESTION_OPTIONS } from './experiments.ts';
import { intendedInterpretationOf, intendedQuestionOf, type Clip } from './clips.ts';
import type { ResponseRecord } from './db.ts';

const MAX_ROUND = 100_000;

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= 200;
}

export function validateResponseInput(
  body: unknown,
  clips: Clip[]
): { value: ResponseRecord } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;

  if (!nonEmpty(b.participant)) return { error: 'participant must be a non-empty string (max 200 chars)' };
  if (!nonEmpty(b.session)) return { error: 'session must be a non-empty string (max 200 chars)' };
  if (typeof b.round !== 'number' || !Number.isInteger(b.round) || b.round < 0 || b.round > MAX_ROUND)
    return { error: `round must be an integer from 0 to ${MAX_ROUND}` };
  if (typeof b.clip !== 'string') return { error: 'clip must be a string' };

  const clip = clips.find((c) => c.file === b.clip);
  if (!clip) return { error: `unknown clip: ${b.clip}` };

  const nat = b.naturalness;
  if (typeof nat !== 'number' || !Number.isInteger(nat) || nat < 1 || nat > 5)
    return { error: 'naturalness must be an integer from 1 to 5' };
  if (typeof b.listenedMs !== 'number' || !Number.isInteger(b.listenedMs) || b.listenedMs < 0)
    return { error: 'listenedMs must be a non-negative integer' };

  const base = {
    participant: b.participant.trim(),
    session: b.session.trim(),
    round: b.round,
    experiment: clip.experiment,
    model: clip.provider,
    clip: clip.file,
    condition: clip.condition,
    variant: clip.variant,
    take: clip.take,
    naturalness: nat,
    listenedMs: b.listenedMs,
  };

  if (clip.experiment === 1) {
    if (b.humanOrAi !== 'Human' && b.humanOrAi !== 'AI') return { error: "humanOrAi must be 'Human' or 'AI'" };
    if (typeof b.questionAnswered !== 'string' || !(QUESTION_OPTIONS as readonly string[]).includes(b.questionAnswered))
      return { error: 'questionAnswered must be one of the survey options' };
    if (b.interpretation !== undefined) return { error: 'interpretation is not asked in Experiment 1' };
    return {
      value: {
        ...base,
        humanOrAi: b.humanOrAi,
        questionAnswered: b.questionAnswered,
        intendedQuestion: intendedQuestionOf(clip),
        interpretation: null,
        intendedInterpretation: null,
      },
    };
  }

  if (b.interpretation !== 'A' && b.interpretation !== 'B') return { error: "interpretation must be 'A' or 'B'" };
  if (b.humanOrAi !== undefined || b.questionAnswered !== undefined)
    return { error: 'only interpretation and naturalness are asked in Experiment 2' };
  return {
    value: {
      ...base,
      humanOrAi: null,
      questionAnswered: null,
      intendedQuestion: null,
      interpretation: b.interpretation,
      intendedInterpretation: intendedInterpretationOf(clip),
    },
  };
}
