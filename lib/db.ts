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
`;

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec(SCHEMA);
  return db;
}

export function defaultDbPath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'arena.db');
}

const g = globalThis as unknown as { __arenaDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__arenaDb) g.__arenaDb = openDatabase(defaultDbPath());
  return g.__arenaDb;
}

export function countRows(db: DatabaseSync, table: 'exp1_trials' | 'exp2_trials' | 'responses'): number {
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

export function insertResponse(db: DatabaseSync, r: ResponseRecord): void {
  db.prepare(
    `INSERT INTO responses (participant, session, round, experiment, model, clip, condition, variant, take,
       naturalness, human_or_ai, question_answered, intended_question, interpretation,
       intended_interpretation, listened_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    r.listenedMs
  );
}
