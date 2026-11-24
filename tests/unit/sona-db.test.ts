import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSupabase } from '../../lib/db/client.ts';
import {
  completeSonaSession,
  countSonaResponses,
  createSonaSession,
  getSonaContact,
  getSonaSession,
  insertSonaResponse,
} from '../../lib/db/sona.ts';
import type { SonaResponseRecord } from '../../lib/db/types.ts';
import { assertLocalSupabase, uniq } from '../db.ts';

assertLocalSupabase();

// Every session this file creates; deleting them cascades to their responses and contacts.
const sessions: string[] = [];
async function session(block = ['a.wav', 'b.wav', 'c.wav']): Promise<string> {
  const id = await createSonaSession({ seed: 7, block, sonaId: uniq('sona'), userAgent: 'node-test', debug: true });
  sessions.push(id);
  return id;
}

function answer(sessionId: string, trialIndex: number, clip: string): SonaResponseRecord {
  return {
    sessionId, trialIndex, clip, experiment: 1, model: 'hume', condition: 'melon', variant: null, take: 1,
    naturalness: 4, humanOrAi: 'AI', questionAnswered: 'What did Molly mail?', intendedQuestion: 'What did Molly mail?',
    interpretation: null, intendedInterpretation: null, listenedMs: 900, responseMs: 4000,
  };
}

after(async () => {
  if (sessions.length) {
    const { error } = await getSupabase().from('sona_sessions').delete().in('id', sessions);
    if (error) throw new Error(`cleanup: ${error.message}`);
  }
});

test('a session round-trips', async () => {
  const id = await session();
  const s = await getSonaSession(id);
  assert.ok(s);
  assert.deepEqual(s.block, ['a.wav', 'b.wav', 'c.wav']);
  assert.equal(s.seed, 7);
  assert.equal(s.debug, true);
  assert.equal(s.userAgent, 'node-test');
  assert.equal(s.completedAt, null);
  assert.equal(await getSonaSession('00000000-0000-4000-8000-000000000000'), null);
});

test('a repeated (session, trial_index) inserts nothing and keeps the first answer', async () => {
  const id = await session();
  assert.equal(await insertSonaResponse(answer(id, 0, 'a.wav')), true);
  assert.equal(await insertSonaResponse({ ...answer(id, 0, 'a.wav'), naturalness: 1 }), false);
  assert.equal(await insertSonaResponse(answer(id, 1, 'b.wav')), true);
  assert.equal(await countSonaResponses(id), 2);
  const { data } = await getSupabase().from('sona_responses').select('naturalness, response_ms').eq('session_id', id).eq('trial_index', 0).single();
  assert.deepEqual(data, { naturalness: 4, response_ms: 4000 });
});

test('the table rejects a trial index outside 0–49', async () => {
  const id = await session();
  await assert.rejects(insertSonaResponse(answer(id, 50, 'x.wav')), /check/i);
});

test('completion needs every trial answered, stores one contact, and happens once', async () => {
  const id = await session();
  const ada = { name: 'Ada', email: 'ada@example.edu' };
  assert.equal(await completeSonaSession('00000000-0000-4000-8000-000000000000', ada), 'not_found');
  assert.equal(await completeSonaSession(id, ada), 'incomplete');
  await insertSonaResponse(answer(id, 0, 'a.wav'));
  await insertSonaResponse(answer(id, 1, 'b.wav'));
  assert.equal(await completeSonaSession(id, ada), 'incomplete');
  assert.equal(await getSonaContact(id), null);
  await insertSonaResponse(answer(id, 2, 'c.wav'));
  assert.equal(await completeSonaSession(id, ada), 'ok');
  assert.deepEqual(await getSonaContact(id), ada);
  assert.ok((await getSonaSession(id))!.completedAt);
  assert.equal(await completeSonaSession(id, ada), 'already_completed');
  assert.equal(await completeSonaSession(id, { name: 'Bob', email: 'bob@example.edu' }), 'already_completed');
  const { count } = await getSupabase().from('sona_contacts').select('*', { count: 'exact', head: true }).eq('session_id', id);
  assert.equal(count, 1);
});

test('a contact stored by an interrupted completion is finished by a retry with the same contact only', async () => {
  const id = await session(['a.wav']);
  await insertSonaResponse(answer(id, 0, 'a.wav'));
  // As if a previous call inserted the contact and died before setting completed_at.
  const { error } = await getSupabase().from('sona_contacts').insert({ session_id: id, name: 'Ada', email: 'ada@example.edu' });
  assert.equal(error, null);
  assert.equal(await completeSonaSession(id, { name: 'Eve', email: 'eve@example.edu' }), 'already_completed');
  assert.equal((await getSonaSession(id))!.completedAt, null);
  assert.equal(await completeSonaSession(id, { name: 'Ada', email: 'ADA@example.edu' }), 'ok');
  assert.ok((await getSonaSession(id))!.completedAt);
});
