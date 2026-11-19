import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  openDatabase,
  upsertUser,
  insertRecording,
  listRecordings,
  getRecording,
  deleteRecording,
  countRows,
} from '../../lib/db.ts';
import { buildPrompts } from '../../lib/prompts.ts';
import { loadExp2Sentences } from '../../lib/stimuli.ts';
import { MAX_RECORDING_BYTES, baseAudioMime, extensionFor, validateRecordingUpload } from '../../lib/recording-input.ts';
import { saveRecordingFile, recordingPath, removeRecordingFile } from '../../lib/recordings-store.ts';

const prompts = buildPrompts(loadExp2Sentences());

test('prompts: 5 Exp 1 conditions with their questions, 5 sentences × A/B with their readings', () => {
  assert.equal(prompts.length, 15);
  const broad = prompts.find((p) => p.id === 'exp1-broad')!;
  assert.equal(broad.sentence, 'Molly mailed a melon.');
  assert.equal(broad.cue, 'What happened?');
  assert.equal(prompts.find((p) => p.id === 'exp1-a')!.cue, 'How many melons did Molly mail?');
  const b = prompts.find((p) => p.id === 'exp2-lisa_telescope-b')!;
  assert.equal(b.interpretation, 'B');
  assert.equal(b.cue, 'Lisa saw a man who is in possession of a telescope.');
  assert.equal(new Set(prompts.map((p) => p.id)).size, 15);
});

test('upload validation: prompt allowlist, audio/* only, size cap', () => {
  const ok = validateRecordingUpload({ promptId: 'exp1-melon', contentType: 'audio/webm;codecs=opus', size: 1000 }, prompts);
  assert.ok('value' in ok);
  assert.equal(ok.value.mime, 'audio/webm');
  assert.equal(ok.value.prompt.experiment, 1);
  const status = (i: { promptId: string | null; contentType: string | null; size: number }) => {
    const r = validateRecordingUpload(i, prompts);
    return 'error' in r ? r.status : 200;
  };
  assert.equal(status({ promptId: 'exp1-nope', contentType: 'audio/webm', size: 10 }), 400);
  assert.equal(status({ promptId: null, contentType: 'audio/webm', size: 10 }), 400);
  assert.equal(status({ promptId: 'exp1-melon', contentType: 'video/webm', size: 10 }), 415);
  assert.equal(status({ promptId: 'exp1-melon', contentType: null, size: 10 }), 415);
  assert.equal(status({ promptId: 'exp1-melon', contentType: 'audio/webm', size: 0 }), 400);
  assert.equal(status({ promptId: 'exp1-melon', contentType: 'audio/webm', size: MAX_RECORDING_BYTES }), 200);
  assert.equal(status({ promptId: 'exp1-melon', contentType: 'audio/webm', size: MAX_RECORDING_BYTES + 1 }), 413);
});

test('mime parsing and extensions never come from anything but the allowlist', () => {
  assert.equal(baseAudioMime('Audio/OGG; codecs=opus'), 'audio/ogg');
  assert.equal(baseAudioMime('audio/../../x'), null);
  assert.equal(extensionFor('audio/webm'), 'webm');
  assert.equal(extensionFor('audio/x-weird'), 'audio');
});

test('files: server-generated names under the user folder; remove deletes them', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rec-'));
  try {
    const rel = saveRecordingFile(7, 'audio/webm', new Uint8Array([1, 2, 3]), dir);
    assert.match(rel, /^7\/[0-9a-f-]{36}\.webm$/);
    assert.deepEqual([...readFileSync(recordingPath(rel, dir))], [1, 2, 3]);
    removeRecordingFile(rel, dir);
    assert.equal(existsSync(recordingPath(rel, dir)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recordings DB: newest first, owner-only lookup and delete', () => {
  const db = openDatabase(':memory:');
  const a = upsertUser(db, { googleSub: 'a', email: null, name: null });
  const b = upsertUser(db, { googleSub: 'b', email: null, name: null });
  const r1 = insertRecording(db, { userId: a.id, experiment: 1, promptId: 'exp1-a', mime: 'audio/webm', path: '1/x.webm', size: 5 });
  const r2 = insertRecording(db, { userId: a.id, experiment: 2, promptId: 'exp2-lisa_telescope-a', mime: 'audio/webm', path: '1/y.webm', size: 5 });
  insertRecording(db, { userId: b.id, experiment: 1, promptId: 'exp1-a', mime: 'audio/webm', path: '2/z.webm', size: 5 });

  assert.deepEqual(listRecordings(db, a.id).map((r) => r.id), [r2, r1]);
  assert.equal(listRecordings(db, b.id).length, 1);
  assert.equal(getRecording(db, r1, a.id)?.promptId, 'exp1-a');
  assert.equal(getRecording(db, r1, b.id), null);
  assert.equal(deleteRecording(db, r1, b.id), false);
  assert.equal(deleteRecording(db, r1, a.id), true);
  assert.equal(countRows(db, 'recordings'), 2);
  // Recordings live apart from the survey and arena tables.
  assert.equal(countRows(db, 'responses'), 0);
  assert.equal(countRows(db, 'exp1_trials'), 0);
});
