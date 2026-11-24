/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Phase 1 placeholder: still written against the old SQLite API; its Phase 2 owner ports it to lib/db and removes this line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, insertResponse, countRows, type ResponseRecord } from '../../lib/db.ts';

const row: ResponseRecord = {
  participant: 'p', session: 's', round: 0, experiment: 2, model: 'human', clip: 'lisa_b_3.wav',
  condition: 'lisa_telescope', variant: 'b', take: 3, naturalness: 4, humanOrAi: null, questionAnswered: null,
  intendedQuestion: null, interpretation: 'A', intendedInterpretation: 'B', listenedMs: 900,
};

test('a repeated (participant, session, round) inserts nothing', () => {
  const db = openDatabase(':memory:');
  assert.equal(insertResponse(db, row), true);
  assert.equal(insertResponse(db, { ...row, naturalness: 1 }), false);
  assert.equal(countRows(db, 'responses'), 1);
  // A different round, session or participant is a new response.
  assert.equal(insertResponse(db, { ...row, round: 1 }), true);
  assert.equal(insertResponse(db, { ...row, session: 's2' }), true);
  assert.equal(insertResponse(db, { ...row, participant: 'q' }), true);
  assert.equal(countRows(db, 'responses'), 4);
});

test('the migration tolerates a database that already holds duplicate rows', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'responses-'));
  const file = path.join(dir, 'arena.db');
  try {
    // An old database: table without the unique index, two rows for the same round.
    const old = openDatabase(file);
    old.exec('DROP INDEX responses_round_unique');
    old.exec(`INSERT INTO responses (participant, session, round, experiment, model, clip, condition, take, naturalness, listened_ms)
              VALUES ('p','s',0,1,'hume','x.wav','a',1,3,10), ('p','s',0,1,'hume','x.wav','a',1,3,10)`);
    old.close();

    const db = openDatabase(file);
    assert.equal(countRows(db, 'responses'), 2, 'existing rows are left alone');
    assert.equal(insertResponse(db, { ...row, participant: 'p', session: 's', round: 0 }), false);
    assert.equal(insertResponse(db, { ...row, participant: 'p', session: 's', round: 1 }), true);
    assert.equal(countRows(db, 'responses'), 3);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh database gets the unique index', () => {
  const db = openDatabase(':memory:');
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'responses_round_unique'").get();
  assert.ok(idx);
});
