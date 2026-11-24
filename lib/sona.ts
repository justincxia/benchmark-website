// The hidden SONA survey (/arena/sonasurvey): its constants and pure rules. No Node builtins,
// because the survey's client component imports this module too. The data layer is
// lib/db/sona.ts; reading clip durations off disk is lib/sona-duration.ts.

import type { ClipInfo } from './clips.ts';

/** Clips per survey block: every Exp 1 model × focus condition once. */
export const SONA_TRIALS = 50;
/** A ?debug=1 session (non-production only) keeps this many clips of its block. */
export const SONA_DEBUG_TRIALS = 3;
/** Time budgeted per clip on top of the clip itself (listening again, three questions). */
export const SONA_SECONDS_PER_TRIAL = 15;
/** Mean clip length assumed when no clip's duration can be read. */
export const SONA_FALLBACK_CLIP_SEC = 1.9;
/** Longest SONA id kept (the ?id= in the study link); longer ones are cut. */
export const SONA_ID_MAX = 100;
export const SONA_NAME_MAX = 200;
export const SONA_EMAIL_MAX = 320;

/** localStorage keys. Never the arena's (`arena_*`). */
export const SONA_STATE_KEY = 'sona_state';
export const SONA_PENDING_KEY = 'sona_pending';

/** The wait before retry `attempt` (0-based) of a failed save: 0.5 s, doubling, at most 30 s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempt));
}

/**
 * The consent form's "about N minutes": the mean clip duration × the number of clips, plus
 * SONA_SECONDS_PER_TRIAL per clip, rounded up to whole minutes. Durations that are not positive
 * finite numbers are ignored; with none left the mean is SONA_FALLBACK_CLIP_SEC.
 */
export function estimateMinutes(durationsSec: number[], trials = SONA_TRIALS): number {
  const ok = durationsSec.filter((d) => Number.isFinite(d) && d > 0);
  const mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : SONA_FALLBACK_CLIP_SEC;
  return Math.ceil((mean * trials + trials * SONA_SECONDS_PER_TRIAL) / 60);
}

/**
 * Where to send a participant after the thank-you screen: `template` (SONA_COMPLETION_URL) with
 * every `%SURVEY_CODE%` replaced by their URL-encoded SONA id. Null (no redirect) without a
 * template or an id.
 */
export function completionRedirectUrl(template: string | null | undefined, sonaId: string | null | undefined): string | null {
  if (!template || !sonaId) return null;
  return template.split('%SURVEY_CODE%').join(encodeURIComponent(sonaId));
}

/** The ?id= value as stored: trimmed, cut to SONA_ID_MAX, null when absent or empty. */
export function normalizeSonaId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, SONA_ID_MAX);
  return s === '' ? null : s;
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * A SONA answer must be for the clip its session's block has at that trial index. Returns an
 * error message, or null when `clip === block[trialIndex]`.
 */
export function checkTrialClip(block: readonly string[], trialIndex: unknown, clip: unknown): string | null {
  if (typeof trialIndex !== 'number' || !Number.isInteger(trialIndex) || trialIndex < 0 || trialIndex >= block.length)
    return `trialIndex must be an integer from 0 to ${block.length - 1}`;
  if (typeof clip !== 'string') return 'clip must be a string';
  if (block[trialIndex] !== clip) return `clip does not match trial ${trialIndex} of this session`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name and email, both required. Used by the contact form and by POST /api/sona/complete. */
export function validateContact(body: unknown): { value: { name: string; email: string } } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (name === '') return { error: 'Please enter your name.' };
  if (name.length > SONA_NAME_MAX) return { error: `Your name must be at most ${SONA_NAME_MAX} characters.` };
  if (email === '') return { error: 'Please enter your email address.' };
  if (email.length > SONA_EMAIL_MAX || !EMAIL_RE.test(email)) return { error: 'Please enter a valid email address.' };
  return { value: { name, email } };
}

/** Whether two contacts are the same person's (a repeated completion): same name, same email
 *  ignoring case. */
export function sameContact(a: { name: string; email: string }, b: { name: string; email: string }): boolean {
  return a.name.trim() === b.name.trim() && a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
}

/**
 * The audio-check clip, never one of the trials: a recording of a human speaker from
 * Experiment 2 (a different sentence from the survey's), chosen deterministically so every
 * participant hears the same one. Null when the manifest has none (the page then plays a
 * generated tone).
 */
export function volumeCheckClip<T extends ClipInfo>(clips: readonly T[]): T | null {
  const pick = (xs: T[]) => xs.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))[0] ?? null;
  const exp2 = clips.filter((c) => c.experiment === 2);
  return pick(exp2.filter((c) => c.provider === 'human')) ?? pick(exp2.slice());
}
