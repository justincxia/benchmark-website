import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSupabase } from '../../lib/db/client.ts';
import { insertResponse } from '../../lib/db/responses.ts';
import type { ResponseRecord } from '../../lib/db/types.ts';
import { assertLocalSupabase, uniq } from '../db.ts';

assertLocalSupabase();

// Every participant this file writes, so cleanup deletes only our own rows.
const participants: string[] = [];
function participant(): string {
  const p = uniq('resp-p');
  participants.push(p);
  return p;
}

function baseRow(p: string, s: string): ResponseRecord {
  return {
    participant: p, session: s, round: 0, experiment: 2, model: 'human', clip: 'lisa_b_3.wav',
    condition: 'lisa_telescope', variant: 'b', take: 3, naturalness: 4, humanOrAi: null, questionAnswered: null,
    intendedQuestion: null, interpretation: 'A', intendedInterpretation: 'B', listenedMs: 900,
  };
}

async function countFor(ps: string[]): Promise<number> {
  const { count, error } = await getSupabase()
    .from('responses')
    .select('*', { count: 'exact', head: true })
    .in('participant', ps);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

after(async () => {
  if (participants.length) {
    const { error } = await getSupabase().from('responses').delete().in('participant', participants);
    if (error) throw new Error(`cleanup: ${error.message}`);
  }
});

test('a repeated (participant, session, round) inserts nothing and keeps the first row', async () => {
  const p = participant();
  const s = uniq('resp-s');
  const row = baseRow(p, s);
  assert.equal(await insertResponse(row), true);
  assert.equal(await insertResponse({ ...row, naturalness: 1, listenedMs: 5 }), false);
  assert.equal(await countFor([p]), 1);

  const { data, error } = await getSupabase()
    .from('responses')
    .select('naturalness, listened_ms')
    .eq('participant', p)
    .eq('session', s)
    .eq('round', 0)
    .single();
  assert.equal(error, null);
  assert.deepEqual(data, { naturalness: 4, listened_ms: 900 });
});

test('a different round, session or participant is a new response', async () => {
  const p = participant();
  const q = participant();
  const s = uniq('resp-s');
  const row = baseRow(p, s);
  assert.equal(await insertResponse(row), true);
  assert.equal(await insertResponse({ ...row, round: 1 }), true);
  assert.equal(await insertResponse({ ...row, session: uniq('resp-s') }), true);
  assert.equal(await insertResponse({ ...row, participant: q }), true);
  assert.equal(await countFor([p, q]), 4);
});

test('the unique constraint exists: a raw duplicate insert fails with 23505', async () => {
  const p = participant();
  const s = uniq('resp-s');
  const raw = {
    participant: p, session: s, round: 0, experiment: 1, model: 'hume', clip: 'x.wav',
    condition: 'a', take: 1, naturalness: 3, listened_ms: 10,
  };
  const first = await getSupabase().from('responses').insert(raw);
  assert.equal(first.error, null);
  const dup = await getSupabase().from('responses').insert(raw);
  assert.equal(dup.error?.code, '23505');
  assert.equal(await countFor([p]), 1);
});
