// The hidden SONA survey's tables (supabase/migrations/*_sona.sql). Isolated: the arena and
// the leaderboard never touch these, and these functions never touch theirs.
import 'server-only';
import { check, getSupabase } from './client.ts';
import { sameContact } from '../sona.ts';
import type { CompleteSonaResult, SonaContact, SonaResponseRecord, SonaSession } from './types.ts';

interface SessionRow {
  id: string;
  created_at: string;
  consented_at: string;
  completed_at: string | null;
  sona_id: string | null;
  seed: number | string;
  block: unknown;
  user_agent: string | null;
  debug: boolean;
}

/** Stores a consented session; returns its uuid. */
export async function createSonaSession(s: {
  seed: number;
  block: string[];
  sonaId: string | null;
  userAgent: string | null;
  debug: boolean;
}): Promise<string> {
  const res = check(
    await getSupabase()
      .from('sona_sessions')
      .insert({ seed: s.seed, block: s.block, sona_id: s.sonaId, user_agent: s.userAgent, debug: s.debug })
      .select('id')
      .single(),
    'create sona session',
  );
  return (res.data as { id: string }).id;
}

export async function getSonaSession(id: string): Promise<SonaSession | null> {
  const res = check(
    await getSupabase().from('sona_sessions').select('*').eq('id', id).maybeSingle(),
    'get sona session',
  );
  const r = res.data as SessionRow | null;
  if (!r) return null;
  return {
    id: r.id,
    createdAt: r.created_at,
    consentedAt: r.consented_at,
    completedAt: r.completed_at,
    sonaId: r.sona_id,
    seed: Number(r.seed),
    block: Array.isArray(r.block) ? r.block.filter((f): f is string => typeof f === 'string') : [],
    userAgent: r.user_agent,
    debug: r.debug,
  };
}

/** Returns false, inserting nothing, when (sessionId, trialIndex) is already recorded
 *  (UNIQUE sona_responses_trial_unique + ON CONFLICT DO NOTHING). */
export async function insertSonaResponse(r: SonaResponseRecord): Promise<boolean> {
  const row = {
    session_id: r.sessionId,
    trial_index: r.trialIndex,
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
    response_ms: r.responseMs,
  };
  const res = check(
    await getSupabase()
      .from('sona_responses')
      .upsert(row, { onConflict: 'session_id,trial_index', ignoreDuplicates: true })
      .select('id'),
    'insert sona response',
  );
  return (res.data?.length ?? 0) > 0;
}

export async function countSonaResponses(sessionId: string): Promise<number> {
  const res = check(
    await getSupabase()
      .from('sona_responses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId),
    'count sona responses',
  );
  return res.count ?? 0;
}

export async function getSonaContact(sessionId: string): Promise<SonaContact | null> {
  const res = check(
    await getSupabase().from('sona_contacts').select('name, email').eq('session_id', sessionId).maybeSingle(),
    'get sona contact',
  );
  return (res.data as SonaContact | null) ?? null;
}

/**
 * Saves the contact and sets completed_at, only once every trial in the block is answered.
 *
 * Not one transaction, but safe: the contact insert is ON CONFLICT (session_id) DO NOTHING, so
 * a session never gets two contacts, and completed_at is set only WHERE completed_at IS NULL.
 * If a previous call stored the contact but failed before setting completed_at, a retry with the
 * same contact finishes the job; a different contact is 'already_completed'.
 */
export async function completeSonaSession(sessionId: string, contact: SonaContact): Promise<CompleteSonaResult> {
  const s = await getSonaSession(sessionId);
  if (!s) return 'not_found';
  if (s.completedAt) return 'already_completed';
  if (s.block.length === 0 || (await countSonaResponses(sessionId)) < s.block.length) return 'incomplete';

  const ins = check(
    await getSupabase()
      .from('sona_contacts')
      .upsert(
        { session_id: sessionId, name: contact.name, email: contact.email },
        { onConflict: 'session_id', ignoreDuplicates: true },
      )
      .select('id'),
    'insert sona contact',
  );
  if ((ins.data?.length ?? 0) === 0) {
    const existing = await getSonaContact(sessionId);
    if (!existing || !sameContact(existing, contact)) return 'already_completed';
  }

  check(
    await getSupabase()
      .from('sona_sessions')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('completed_at', null),
    'complete sona session',
  );
  return 'ok';
}
