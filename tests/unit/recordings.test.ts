import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { getSupabase, recordingsBucket } from '../../lib/db/client.ts';
import { insertRecording, listRecordings, getRecording, deleteRecording } from '../../lib/db/recordings.ts';
import { buildPrompts } from '../../lib/prompts.ts';
import { loadExp2Sentences } from '../../lib/stimuli.ts';
import { MAX_RECORDING_BYTES, baseAudioMime, extensionFor, validateRecordingUpload } from '../../lib/recording-input.ts';
import {
  saveRecordingFile,
  removeRecordingFile,
  fetchRecordingObject,
  parseByteRange,
  recordingAudioResponse,
} from '../../lib/recordings-store.ts';
import { assertLocalSupabase, uniq } from '../db.ts';

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

// ---- Storage and DB (local Supabase, shared: only this file's own users and objects) ----

const userIds: number[] = [];
const keys: string[] = [];

async function makeUser(): Promise<number> {
  const { data, error } = await getSupabase().from('users').insert({ google_sub: uniq('rec') }).select('id').single();
  if (error) throw new Error(error.message);
  const id = Number(data.id);
  userIds.push(id);
  return id;
}

async function objectExists(key: string): Promise<boolean> {
  const [dir, name] = key.split('/');
  const { data, error } = await getSupabase().storage.from(recordingsBucket()).list(dir, { search: name });
  if (error) throw new Error(error.message);
  return (data ?? []).some((o) => o.name === name);
}

before(() => assertLocalSupabase());

after(async () => {
  if (keys.length) await getSupabase().storage.from(recordingsBucket()).remove(keys);
  // Their recordings rows cascade.
  if (userIds.length) await getSupabase().from('users').delete().in('id', userIds);
});

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);

test('storage: server-generated key under the user folder, private, round-trips, remove deletes it', async () => {
  const uid = await makeUser();
  const key = await saveRecordingFile(uid, 'audio/webm', BYTES);
  keys.push(key);
  assert.match(key, new RegExp(`^${uid}/[0-9a-f-]{36}\\.webm$`));
  assert.equal(await objectExists(key), true);

  const { data, error } = await getSupabase().storage.from(recordingsBucket()).download(key);
  assert.equal(error, null);
  assert.deepEqual(new Uint8Array(await data!.arrayBuffer()), BYTES);
  assert.equal(data!.type.split(';')[0], 'audio/webm');

  // The bucket is private: its public URL serves nothing.
  const pub = await fetch(getSupabase().storage.from(recordingsBucket()).getPublicUrl(key).data.publicUrl);
  assert.notEqual(pub.status, 200);
  await pub.body?.cancel();

  await removeRecordingFile(key);
  assert.equal(await objectExists(key), false);
  assert.equal(await fetchRecordingObject(key), null);
  await removeRecordingFile(key); // already gone: not an error
});

test('range parsing mirrors the clip route', () => {
  assert.equal(parseByteRange(null, 100), null);
  assert.equal(parseByteRange('bytes=-', 100), null);
  assert.equal(parseByteRange('items=0-1', 100), null);
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-5', 100), { start: 95, end: 99 });
  assert.deepEqual(parseByteRange('bytes=95-500', 100), { start: 95, end: 99 });
  assert.equal(parseByteRange('bytes=100-', 100), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=20-10', 100), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=-500', 100), 'unsatisfiable');
});

test('audio response: 200 whole, 206 slice and suffix, 416, 404 once the object is gone', async () => {
  const uid = await makeUser();
  const key = await saveRecordingFile(uid, 'audio/ogg', BYTES);
  keys.push(key);
  const rec = { path: key, mime: 'audio/ogg', size: BYTES.byteLength };
  const body = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())];
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const leaks = (r: Response) => [...r.headers].some(([, v]) => v.includes(secret));

  const whole = await recordingAudioResponse(rec, null);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'audio/ogg');
  assert.equal(whole.headers.get('content-length'), '100');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal(whole.headers.get('cache-control'), 'private, no-store');
  assert.equal(leaks(whole), false);
  assert.deepEqual(await body(whole), [...BYTES]);

  const slice = await recordingAudioResponse(rec, 'bytes=10-19');
  assert.equal(slice.status, 206);
  assert.equal(slice.headers.get('content-range'), 'bytes 10-19/100');
  assert.equal(slice.headers.get('content-length'), '10');
  assert.equal(slice.headers.get('accept-ranges'), 'bytes');
  assert.equal(slice.headers.get('content-type'), 'audio/ogg');
  assert.equal(leaks(slice), false);
  assert.deepEqual(await body(slice), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

  const open = await recordingAudioResponse(rec, 'bytes=97-');
  assert.equal(open.status, 206);
  assert.equal(open.headers.get('content-range'), 'bytes 97-99/100');
  assert.deepEqual(await body(open), [97, 98, 99]);

  const suffix = await recordingAudioResponse(rec, 'bytes=-5');
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get('content-range'), 'bytes 95-99/100');
  assert.equal(suffix.headers.get('content-length'), '5');
  assert.deepEqual(await body(suffix), [95, 96, 97, 98, 99]);

  const bad = await recordingAudioResponse(rec, 'bytes=100-');
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), 'bytes */100');
  await bad.body?.cancel();

  await removeRecordingFile(key);
  const gone = await recordingAudioResponse(rec, null);
  assert.equal(gone.status, 404);
  assert.equal(await gone.text(), 'Not found');
  assert.equal((await recordingAudioResponse(rec, 'bytes=0-9')).status, 404);
  assert.equal((await recordingAudioResponse(rec, 'bytes=100-')).status, 404);
});

test('recordings DB: newest first, owner-only lookup and delete', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const r1 = await insertRecording({ userId: a, experiment: 1, promptId: 'exp1-a', mime: 'audio/webm', path: `${a}/x.webm`, size: 5 });
  const r2 = await insertRecording({ userId: a, experiment: 2, promptId: 'exp2-lisa_telescope-a', mime: 'audio/webm', path: `${a}/y.webm`, size: 5 });
  await insertRecording({ userId: b, experiment: 1, promptId: 'exp1-a', mime: 'audio/webm', path: `${b}/z.webm`, size: 5 });

  const listA = await listRecordings(a);
  assert.deepEqual(listA.map((r) => r.id), [r2, r1]);
  assert.equal(listA[0].experiment, 2);
  assert.match(listA[0].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal((await listRecordings(b)).length, 1);

  const got = await getRecording(r1, a);
  assert.deepEqual(
    { ...got!, createdAt: '' },
    { id: r1, userId: a, experiment: 1, promptId: 'exp1-a', createdAt: '', mime: 'audio/webm', path: `${a}/x.webm`, size: 5 }
  );
  assert.equal(await getRecording(r1, b), null);
  assert.equal(await getRecording(-1, a), null);
  assert.equal(await deleteRecording(r1, b), false);
  assert.equal(await deleteRecording(r1, a), true);
  assert.equal(await deleteRecording(r1, a), false);
  assert.equal(await getRecording(r1, a), null);
  assert.deepEqual((await listRecordings(a)).map((r) => r.id), [r2]);
});
