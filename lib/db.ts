// The only module that touches SQLite. Server-only: client components may import its types
// with `import type` and nothing else, or node:sqlite ends up in the client bundle.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS exp1_trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant TEXT NOT NULL,
    trial_number INTEGER,
    is_attention_check INTEGER NOT NULL CHECK (is_attention_check IN (0, 1)),
    provider TEXT,
    condition TEXT NOT NULL,
    take INTEGER,
    audio_file TEXT,
    intended_question TEXT,
    naturalness INTEGER CHECK (naturalness BETWEEN 1 AND 5),
    human_or_ai TEXT CHECK (human_or_ai IN ('Human', 'AI')),
    question_answered TEXT,
    CHECK (is_attention_check = 1 OR (provider IS NOT NULL AND intended_question IS NOT NULL))
  );

  CREATE TABLE IF NOT EXISTS exp2_trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant TEXT NOT NULL,
    trial_number INTEGER,
    is_attention_check INTEGER NOT NULL CHECK (is_attention_check IN (0, 1)),
    provider TEXT,
    condition TEXT NOT NULL,
    variant TEXT CHECK (variant IN ('a', 'b')),
    take INTEGER,
    audio_file TEXT,
    intended_interpretation TEXT CHECK (intended_interpretation IN ('A', 'B')),
    interpretation TEXT CHECK (interpretation IN ('A', 'B')),
    naturalness INTEGER CHECK (naturalness BETWEEN 1 AND 5),
    CHECK (is_attention_check = 1 OR (provider IS NOT NULL AND intended_interpretation IS NOT NULL))
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant TEXT NOT NULL,
    session TEXT NOT NULL,
    round INTEGER NOT NULL,
    experiment INTEGER NOT NULL CHECK (experiment IN (1, 2)),
    model TEXT NOT NULL,
    clip TEXT NOT NULL,
    condition TEXT NOT NULL,
    variant TEXT,
    take INTEGER NOT NULL,
    naturalness INTEGER NOT NULL CHECK (naturalness BETWEEN 1 AND 5),
    human_or_ai TEXT CHECK (human_or_ai IN ('Human', 'AI')),
    question_answered TEXT,
    intended_question TEXT,
    interpretation TEXT CHECK (interpretation IN ('A', 'B')),
    intended_interpretation TEXT CHECK (intended_interpretation IN ('A', 'B')),
    listened_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    experiment INTEGER NOT NULL CHECK (experiment IN (1, 2)),
    prompt_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS recordings_user ON recordings (user_id, id);
`;

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrateResponses(db);
  return db;
}

/**
 * One response per (participant, session, round). A UNIQUE index enforces it; a database that
 * already holds duplicate rows from before this existed cannot take that index, so it gets a
 * plain index instead and keeps its rows untouched. Either way insertResponse() refuses a
 * repeat with an atomic INSERT … WHERE NOT EXISTS, so new duplicates never land.
 */
export function migrateResponses(db: DatabaseSync): void {
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS responses_round_unique ON responses (participant, session, round)');
  } catch {
    db.exec('CREATE INDEX IF NOT EXISTS responses_round ON responses (participant, session, round)');
  }
}

export function defaultDbPath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'arena.db');
}

const g = globalThis as unknown as { __arenaDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__arenaDb) g.__arenaDb = openDatabase(defaultDbPath());
  return g.__arenaDb;
}

export function countRows(
  db: DatabaseSync,
  table: 'exp1_trials' | 'exp2_trials' | 'responses' | 'users' | 'sessions' | 'recordings'
): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

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

export function insertExp1Trial(db: DatabaseSync, r: Exp1Trial): void {
  db.prepare(
    `INSERT INTO exp1_trials (participant, trial_number, is_attention_check, provider, condition, take,
       audio_file, intended_question, naturalness, human_or_ai, question_answered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    r.participant,
    r.trialNumber,
    r.isAttentionCheck ? 1 : 0,
    r.provider,
    r.condition,
    r.take,
    r.audioFile,
    r.intendedQuestion,
    r.naturalness,
    r.humanOrAi,
    r.questionAnswered
  );
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

export function insertExp2Trial(db: DatabaseSync, r: Exp2Trial): void {
  db.prepare(
    `INSERT INTO exp2_trials (participant, trial_number, is_attention_check, provider, condition, variant,
       take, audio_file, intended_interpretation, interpretation, naturalness)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    r.participant,
    r.trialNumber,
    r.isAttentionCheck ? 1 : 0,
    r.provider,
    r.condition,
    r.variant,
    r.take,
    r.audioFile,
    r.intendedInterpretation,
    r.interpretation,
    r.naturalness
  );
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

/** Attention checks are excluded here, in SQL, from every metric. */
export function getExp1Counts(db: DatabaseSync): Record<string, Exp1Counts> {
  const rows = db
    .prepare(
      `SELECT provider,
         COUNT(*) AS trials,
         COUNT(question_answered) AS focusN,
         SUM(CASE WHEN question_answered = intended_question THEN 1 ELSE 0 END) AS focusCorrect,
         COUNT(naturalness) AS natN,
         COALESCE(SUM(naturalness), 0) AS natSum,
         COUNT(human_or_ai) AS humanAiN,
         SUM(CASE WHEN human_or_ai = 'Human' THEN 1 ELSE 0 END) AS judgedHuman
       FROM exp1_trials WHERE is_attention_check = 0 GROUP BY provider`
    )
    .all() as unknown as (Exp1Counts & { provider: string })[];
  return Object.fromEntries(rows.map(({ provider, ...c }) => [provider, { ...c }]));
}

export function getExp2Counts(db: DatabaseSync): Record<string, Exp2Counts> {
  const rows = db
    .prepare(
      `SELECT provider,
         COUNT(*) AS trials,
         COUNT(interpretation) AS interpN,
         SUM(CASE WHEN interpretation = intended_interpretation THEN 1 ELSE 0 END) AS interpCorrect,
         COUNT(naturalness) AS natN,
         COALESCE(SUM(naturalness), 0) AS natSum
       FROM exp2_trials WHERE is_attention_check = 0 GROUP BY provider`
    )
    .all() as unknown as (Exp2Counts & { provider: string })[];
  return Object.fromEntries(rows.map(({ provider, ...c }) => [provider, { ...c }]));
}

/** Exp 2 interpretation counts per model and sentence: provider → condition → counts. Lets
 *  the leaderboard recompute accuracy over a chosen subset of the sentences. */
export type Exp2InterpBySentence = Record<string, Record<string, { n: number; correct: number }>>;

export function getExp2InterpBySentence(db: DatabaseSync): Exp2InterpBySentence {
  const rows = db
    .prepare(
      `SELECT provider, condition,
         COUNT(interpretation) AS n,
         COALESCE(SUM(interpretation = intended_interpretation), 0) AS correct
       FROM exp2_trials WHERE is_attention_check = 0 GROUP BY provider, condition`
    )
    .all() as unknown as { provider: string; condition: string; n: number; correct: number }[];
  const out: Exp2InterpBySentence = {};
  for (const r of rows) (out[r.provider] ??= {})[r.condition] = { n: r.n, correct: r.correct };
  return out;
}

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

/** Returns false, inserting nothing, when this (participant, session, round) is already recorded. */
export function insertResponse(db: DatabaseSync, r: ResponseRecord): boolean {
  const result = db.prepare(
    `INSERT INTO responses (participant, session, round, experiment, model, clip, condition, variant, take,
       naturalness, human_or_ai, question_answered, intended_question, interpretation,
       intended_interpretation, listened_ms)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM responses WHERE participant = ? AND session = ? AND round = ?)`
  ).run(
    r.participant,
    r.session,
    r.round,
    r.experiment,
    r.model,
    r.clip,
    r.condition,
    r.variant,
    r.take,
    r.naturalness,
    r.humanOrAi,
    r.questionAnswered,
    r.intendedQuestion,
    r.interpretation,
    r.intendedInterpretation,
    r.listenedMs,
    r.participant,
    r.session,
    r.round
  );
  return Number(result.changes) > 0;
}

// ---- accounts (users, sessions) ----
// Tokens are never stored: sessions are keyed by the SHA-256 of the cookie value.

export interface User {
  id: number;
  googleSub: string;
  email: string | null;
  name: string | null;
}

/** Creates the user on first sign-in, refreshes email/name afterwards. */
export function upsertUser(db: DatabaseSync, u: { googleSub: string; email: string | null; name: string | null }): User {
  db.prepare(
    `INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?)
     ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name`
  ).run(u.googleSub, u.email, u.name);
  const row = db.prepare('SELECT id, google_sub, email, name FROM users WHERE google_sub = ?').get(u.googleSub) as {
    id: number;
    google_sub: string;
    email: string | null;
    name: string | null;
  };
  return { id: row.id, googleSub: row.google_sub, email: row.email, name: row.name };
}

export function insertSession(db: DatabaseSync, tokenHash: string, userId: number, expiresAt: number): void {
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
}

/** The session's user, or null when the session is unknown or expired (expired rows are removed). */
export function userForSession(db: DatabaseSync, tokenHash: string, now: number): User | null {
  const row = db
    .prepare(
      `SELECT s.expires_at, u.id, u.google_sub, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | { expires_at: number; id: number; google_sub: string; email: string | null; name: string | null }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    deleteSession(db, tokenHash);
    return null;
  }
  return { id: row.id, googleSub: row.google_sub, email: row.email, name: row.name };
}

export function deleteSession(db: DatabaseSync, tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

// ---- recordings ----

export interface RecordingRow {
  id: number;
  userId: number;
  experiment: 1 | 2;
  promptId: string;
  createdAt: string;
  mime: string;
  /** Relative to RECORDINGS_DIR; server-generated. */
  path: string;
  size: number;
}

const RECORDING_COLUMNS =
  'id, user_id AS userId, experiment, prompt_id AS promptId, created_at AS createdAt, mime, path, size';

export function insertRecording(
  db: DatabaseSync,
  r: { userId: number; experiment: 1 | 2; promptId: string; mime: string; path: string; size: number }
): number {
  const res = db
    .prepare('INSERT INTO recordings (user_id, experiment, prompt_id, mime, path, size) VALUES (?, ?, ?, ?, ?, ?)')
    .run(r.userId, r.experiment, r.promptId, r.mime, r.path, r.size);
  return Number(res.lastInsertRowid);
}

/** A user's recordings, newest first. */
export function listRecordings(db: DatabaseSync, userId: number): RecordingRow[] {
  return db
    .prepare(`SELECT ${RECORDING_COLUMNS} FROM recordings WHERE user_id = ? ORDER BY id DESC`)
    .all(userId) as unknown as RecordingRow[];
}

/** One recording, only if it belongs to `userId`. */
export function getRecording(db: DatabaseSync, id: number, userId: number): RecordingRow | null {
  const row = db
    .prepare(`SELECT ${RECORDING_COLUMNS} FROM recordings WHERE id = ? AND user_id = ?`)
    .get(id, userId) as unknown as RecordingRow | undefined;
  return row ?? null;
}

export function deleteRecording(db: DatabaseSync, id: number, userId: number): boolean {
  return Number(db.prepare('DELETE FROM recordings WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}
