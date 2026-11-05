import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvRecords } from '../../lib/csv.ts';

test('quoted fields keep their commas, quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"\nthere'],
  ]);
});

test('CRLF line endings and a trailing blank line are handled', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('empty trailing fields survive', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,\n'), [
    ['a', 'b', 'c'],
    ['1', '', ''],
  ]);
});

test('a ragged row is rejected rather than misaligned', () => {
  assert.throws(() => parseCsvRecords('a,b\n1,2,3\n'), /3 fields, header has 2/);
});

test('an unterminated quote is rejected', () => {
  assert.throws(() => parseCsv('a\n"oops\n'), /quoted field/);
});
