// Row and result shapes of the data layer. Pure types: safe to `import type` from client
// components (unlike every other module in lib/db/, which is server-only).

export type TableName =
  | 'exp1_trials'
  | 'exp2_trials'
  | 'responses'
  | 'users'
  | 'sessions'
  | 'recordings'
  | 'sona_sessions'
  | 'sona_responses'
  | 'sona_contacts';

// ---- survey trials ----

export interface Exp1Trial {
  participant: string;
  trialNumber: number | null;
  isAttentionCheck: boolean;
  provider: string | null;
  condition: string;
  take: number | null;
  audioFile: string | null;
  intendedQuestion: string | null;
  naturalness: number | null;
  humanOrAi: 'Human' | 'AI' | null;
  questionAnswered: string | null;
}

export interface Exp2Trial {
  participant: string;
  trialNumber: number | null;
  isAttentionCheck: boolean;
  provider: string | null;
  condition: string;
  variant: 'a' | 'b' | null;
  take: number | null;
  audioFile: string | null;
  intendedInterpretation: 'A' | 'B' | null;
  interpretation: 'A' | 'B' | null;
  naturalness: number | null;
}

// ---- per-model counts (the raw material of every displayed metric) ----

/** Counts behind the Exp 1 columns. Each metric has its own denominator: a trial whose answer
 *  to that question is missing (timeout / NA) is left out of that metric only. */
export interface Exp1Counts {
  trials: number;
  focusN: number;
  focusCorrect: number;
  natN: number;
  natSum: number;
  humanAiN: number;
  judgedHuman: number;
}

export interface Exp2Counts {
  trials: number;
  interpN: number;
  interpCorrect: number;
  natN: number;
  natSum: number;
}

/** Exp 2 interpretation counts per model and sentence: provider → condition → counts. Lets
 *  the leaderboard recompute accuracy over a chosen subset of the sentences. */
export type Exp2InterpBySentence = Record<string, Record<string, { n: number; correct: number }>>;

// ---- arena responses ----

export interface ResponseRecord {
  participant: string;
  session: string;
  round: number;
  experiment: 1 | 2;
  model: string;
  clip: string;
  condition: string;
  variant: 'a' | 'b' | null;
  take: number;
  naturalness: number;
  humanOrAi: 'Human' | 'AI' | null;
  questionAnswered: string | null;
  intendedQuestion: string | null;
  interpretation: 'A' | 'B' | null;
  intendedInterpretation: 'A' | 'B' | null;
  listenedMs: number;
}

// ---- accounts ----

export interface User {
  id: number;
  googleSub: string;
  email: string | null;
  name: string | null;
}

// ---- recordings ----

export interface RecordingRow {
  id: number;
  userId: number;
  experiment: 1 | 2;
  promptId: string;
  /** ISO 8601 UTC with milliseconds and a Z, e.g. 2026-11-23T21:42:00.123Z (as before). */
  createdAt: string;
  mime: string;
  /** Object key in the recordings bucket, `<userId>/<uuid>.<ext>`; server-generated. */
  path: string;
  size: number;
}

// ---- SONA survey ----

export interface SonaSession {
  id: string;
  createdAt: string;
  consentedAt: string;
  completedAt: string | null;
  sonaId: string | null;
  seed: number;
  /** Clip basenames in play order (50, or 3 for a debug session). */
  block: string[];
  userAgent: string | null;
  debug: boolean;
}

/** A SONA answer: the arena's ResponseRecord minus participant/session/round, keyed by
 *  (sessionId, trialIndex) instead, plus the time to answer. */
export interface SonaResponseRecord
  extends Omit<ResponseRecord, 'participant' | 'session' | 'round'> {
  sessionId: string;
  trialIndex: number;
  responseMs: number;
}

export interface SonaContact {
  name: string;
  email: string;
}

export type CompleteSonaResult = 'ok' | 'not_found' | 'incomplete' | 'already_completed';
