import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readManifest } from '../../lib/clip-manifest.ts';
import { loadAllClips } from '../../lib/stimuli.ts';
import { writeTestWav } from '../fixtures/make-audio.ts';

const all = loadAllClips();

test('the manifest holds exactly the referenced clips that exist on disk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
  try {
    const keep = [all[0], all.find((c) => c.experiment === 2)!];
    for (const c of keep) {
      mkdirSync(path.dirname(path.join(dir, c.relPath)), { recursive: true });
      writeTestWav(path.join(dir, c.relPath));
    }
    // A stray file that no stimulus list references is never servable.
    writeTestWav(path.join(dir, 'stray.wav'));
    assert.deepEqual(readManifest(dir, all).map((c) => c.file).sort(), keep.map((c) => c.file).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing or empty audio directory is an explicit error', () => {
  assert.throws(() => readManifest('/nonexistent/audio', all), /No stimulus directory/);
  const dir = mkdtempSync(path.join(tmpdir(), 'manifest-'));
  try {
    assert.throws(() => readManifest(dir, all), /No stimuli found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
