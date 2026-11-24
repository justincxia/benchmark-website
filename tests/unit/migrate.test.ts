// scripts/migrate-sqlite-to-supabase.ts against the shared local Supabase. Every row uses an id
// ≥ 900000 (random base per run) and unique keys, and is deleted by id afterwards, so it never
// touches other tests' rows. Note: the real run calls reset_identity_sequences(), which moves
// the users/responses/recordings sequences past these ids — harmless, new ids just start higher.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSupabase, recordingsBucket } from '../../lib/db/client.ts';
import { assertLocalSupabase, uniq } from '../db.ts';
import { migrate, toUtcIso } from '../../scripts/migrate-sqlite-to-supabase.ts';

// The old lib/db.ts schema (git show 658f9b1:lib/db.ts), minus the survey-trial tables.
const OLD_SCHEMA = `
  CREATE TABLE responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant TEXT NOT NULL, session TEXT NOT NULL, round INTEGER NOT NULL,
    experiment INTEGER NOT NULL CHECK (experiment IN (1, 2)),
    model TEXT NOT NULL, clip TEXT NOT NULL, condition TEXT NOT NULL, variant TEXT, take INTEGER NOT NULL,
    naturalness INTEGER NOT NULL CHECK (naturalness BETWEEN 1 AND 5),
    human_or_ai TEXT CHECK (human_or_ai IN ('Human', 'AI')),
    question_answered TEXT, intended_question TEXT,
    interpretation TEXT CHECK (interpretation IN ('A', 'B')),
    intended_interpretation TEXT CHECK (intended_interpretation IN ('A', 'B')),
    listened_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX responses_round ON responses (participant, session, round);
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE, email TEXT, name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    experiment INTEGER NOT NULL CHECK (experiment IN (1, 2)),
    prompt_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    mime TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL
  );
`;

assertLocalSupabase();
const sb = getSupabase();
const bucket = recordingsBucket();
const BASE = 900000 + Math.floor(Math.random() * 90000) * 10;
const USER = BASE;
const R1 = BASE + 1, R2 = BASE + 2, R3 = BASE + 3; // R2 duplicates R1's (participant, session, round)
const REC_OK = BASE + 4, REC_MISSING = BASE + 5;
const sub = uniq('migrate-sub');
const participant = uniq('migrate-p');
const token = uniq('migrate-token');
const okKey = `${USER}/${randomUUID()}.webm`;
const missingKey = `${USER}/${randomUUID()}.webm`;
const audio = Buffer.from('fake webm bytes ' + randomUUID());
const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

const dir = mkdtempSync(path.join(tmpdir(), 'migrate-test-'));
const sqlitePath = path.join(dir, 'arena.db');
const recordingsDir = path.join(dir, 'recordings');
mkdirSync(path.join(recordingsDir, String(USER)), { recursive: true });
writeFileSync(path.join(recordingsDir, okKey), audio);

{
  const db = new DatabaseSync(sqlitePath);
  db.exec(OLD_SCHEMA);
  db.prepare("INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, 'a@b.c', 'Ann', '2026-10-27 19:05:41')").run(USER, sub);
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, '2026-10-28 08:00:00', ?)").run(token, USER, expiresAt);
  const ins = db.prepare(
    `INSERT INTO responses (id, participant, session, round, experiment, model, clip, condition, variant, take,
       naturalness, human_or_ai, question_answered, intended_question, interpretation, intended_interpretation,
       listened_ms, created_at) VALUES (?, ?, 's1', ?, ?, 'openai', 'clip.wav', 'broad', ?, 1, ?, ?, ?, ?, ?, ?, 1234, ?)`
  );
  ins.run(R1, participant, 1, 1, null, 4, 'AI', 'What happened?', 'What happened?', null, null, '2026-10-27 19:06:00');
  ins.run(R2, participant, 1, 1, null, 2, 'Human', 'Who?', 'What happened?', null, null, '2026-10-27 19:07:00');
  ins.run(R3, participant, 2, 2, 'a', 5, null, null, null, 'A', 'B', '2026-10-27 19:08:30');
  const rec = db.prepare(
    "INSERT INTO recordings (id, user_id, experiment, prompt_id, created_at, mime, path, size) VALUES (?, ?, 1, 'exp1-broad', ?, 'audio/webm', ?, ?)"
  );
  rec.run(REC_OK, USER, '2026-10-29T10:11:12.345Z', okKey, audio.length);
  rec.run(REC_MISSING, USER, '2026-10-29T10:12:00.000Z', missingKey, 99);
  db.close();
}

after(async () => {
  await sb.from('recordings').delete().in('id', [REC_OK, REC_MISSING]);
  await sb.from('responses').delete().in('id', [R1, R2, R3]);
  await sb.from('sessions').delete().eq('token_hash', token);
  await sb.from('users').delete().eq('id', USER);
  await sb.storage.from(bucket).remove([okKey, missingKey]);
  rmSync(dir, { recursive: true, force: true });
});

const quiet = () => {};

test('toUtcIso: SQLite datetime (UTC, no zone) and ISO with Z', () => {
  assert.equal(toUtcIso('2026-10-27 19:05:41'), '2026-10-27T19:05:41.000Z');
  assert.equal(toUtcIso('2026-10-29T10:11:12.345Z'), '2026-10-29T10:11:12.345Z');
  assert.throws(() => toUtcIso('yesterday'));
});

test('dry run reports counts and writes nothing', async () => {
  const r = await migrate({ sqlitePath, recordingsDir, dryRun: true, log: quiet });
  assert.deepEqual(r.tables.users, { source: 1, toCopy: 1, alreadyPresent: 0, copied: 1, skipped: 0 });
  assert.deepEqual(r.tables.sessions, { source: 1, toCopy: 1, alreadyPresent: 0, copied: 1, skipped: 0 });
  assert.deepEqual(r.tables.responses, { source: 3, toCopy: 2, alreadyPresent: 0, copied: 2, skipped: 1 });
  assert.deepEqual(r.tables.recordings, { source: 2, toCopy: 1, alreadyPresent: 0, copied: 1, skipped: 1 });
  assert.deepEqual(r.duplicateResponseIds, [R2]);
  assert.deepEqual(r.missingRecordingFiles, [{ id: REC_MISSING, path: missingKey }]);
  assert.deepEqual(r.objects, { toCopy: 1, alreadyPresent: 0, uploaded: 1 });

  const ids = async (table: string, keys: (number | string)[], col = 'id') =>
    ((await sb.from(table).select(col).in(col, keys)).data ?? []).length;
  assert.equal(await ids('users', [USER]), 0);
  assert.equal(await ids('sessions', [token], 'token_hash'), 0);
  assert.equal(await ids('responses', [R1, R2, R3]), 0);
  assert.equal(await ids('recordings', [REC_OK, REC_MISSING]), 0);
  assert.equal((await sb.storage.from(bucket).exists(okKey)).data, false);
});

test('real run copies rows with ids and UTC timestamps, uploads the object, then a rerun is a no-op', async () => {
  const r = await migrate({ sqlitePath, recordingsDir, log: quiet });
  assert.deepEqual(r.mismatches, []);
  assert.equal(r.tables.users.copied, 1);
  assert.equal(r.tables.sessions.copied, 1);
  assert.equal(r.tables.responses.copied, 2);
  assert.equal(r.tables.recordings.copied, 1);
  assert.equal(r.objects.uploaded, 1);

  const user = (await sb.from('users').select('*').eq('id', USER).single()).data;
  assert.equal(user.google_sub, sub);
  assert.equal(user.name, 'Ann');
  assert.equal(new Date(user.created_at).toISOString(), '2026-10-27T19:05:41.000Z');

  const sess = (await sb.from('sessions').select('*').eq('token_hash', token).single()).data;
  assert.equal(Number(sess.user_id), USER);
  assert.equal(Number(sess.expires_at), expiresAt);
  assert.equal(new Date(sess.created_at).toISOString(), '2026-10-28T08:00:00.000Z');

  const resp = (await sb.from('responses').select('*').in('id', [R1, R2, R3]).order('id')).data ?? [];
  assert.deepEqual(resp.map((x) => Number(x.id)), [R1, R3]);
  assert.equal(resp[0].naturalness, 4); // the lowest id won
  assert.equal(resp[0].human_or_ai, 'AI');
  assert.equal(new Date(resp[0].created_at).toISOString(), '2026-10-27T19:06:00.000Z');
  assert.equal(resp[1].variant, 'a');
  assert.equal(resp[1].interpretation, 'A');
  assert.equal(resp[1].listened_ms, 1234);

  const recs = (await sb.from('recordings').select('*').in('id', [REC_OK, REC_MISSING])).data ?? [];
  assert.equal(recs.length, 1);
  assert.equal(Number(recs[0].id), REC_OK);
  assert.equal(recs[0].path, okKey);
  assert.equal(recs[0].size, audio.length);
  assert.equal(new Date(recs[0].created_at).toISOString(), '2026-10-29T10:11:12.345Z');

  const dl = await sb.storage.from(bucket).download(okKey);
  assert.equal(dl.error, null);
  assert.deepEqual(Buffer.from(await dl.data!.arrayBuffer()), audio);
  assert.equal((await sb.storage.from(bucket).exists(missingKey)).data, false);

  const again = await migrate({ sqlitePath, recordingsDir, log: quiet });
  assert.deepEqual(again.mismatches, []);
  for (const t of ['users', 'sessions', 'responses', 'recordings'] as const) {
    assert.equal(again.tables[t].copied, 0, t);
    assert.equal(again.tables[t].alreadyPresent, again.tables[t].toCopy, t);
  }
  assert.equal(again.objects.uploaded, 0);
  assert.equal(again.objects.alreadyPresent, 1);
});
