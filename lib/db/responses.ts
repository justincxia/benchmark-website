// Arena responses. Writes only to `responses`; nothing that renders a page reads it.
import 'server-only';
import { check, getSupabase } from './client.ts';
import type { ResponseRecord } from './types.ts';

/** Returns false, inserting nothing, when this (participant, session, round) is already
 *  recorded (UNIQUE constraint responses_round_unique + ON CONFLICT DO NOTHING). */
export async function insertResponse(r: ResponseRecord): Promise<boolean> {
  const row = {
    participant: r.participant,
    session: r.session,
    round: r.round,
    experiment: r.experiment,
    model: r.model,
    clip: r.clip,
    condition: r.condition,
    variant: r.variant,
    take: r.take,
    naturalness: r.naturalness,
    human_or_ai: r.humanOrAi,
    question_answered: r.questionAnswered,
    intended_question: r.intendedQuestion,
    interpretation: r.interpretation,
    intended_interpretation: r.intendedInterpretation,
    listened_ms: r.listenedMs,
  };
  // One atomic INSERT ... ON CONFLICT (participant, session, round) DO NOTHING RETURNING id:
  // a conflicting row comes back as an empty array rather than an error.
  const res = check(
    await getSupabase()
      .from('responses')
      .upsert(row, { onConflict: 'participant,session,round', ignoreDuplicates: true })
      .select('id'),
    'insert response',
  );
  return (res.data?.length ?? 0) > 0;
}
