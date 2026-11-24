import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJsonCapped } from '../../lib/sona-request.ts';

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://x/api/sona/session', { method: 'POST', body, headers });

test('SONA bodies: valid JSON passes, bad JSON is 400, oversized is 413 (declared or streamed)', async () => {
  assert.deepEqual(await readJsonCapped(req('{"a":1}')), { value: { a: 1 } });
  assert.deepEqual(await readJsonCapped(req('{nope')), { error: 'body must be valid JSON', status: 400 });
  const big = JSON.stringify({ x: 'y'.repeat(100) });
  assert.equal((await readJsonCapped(req(big), 50) as { status: number }).status, 413);
  assert.equal((await readJsonCapped(req('{}', { 'content-length': '999999' }), 50) as { status: number }).status, 413);
});
