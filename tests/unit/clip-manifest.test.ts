import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clipsInManifest } from '../../lib/clip-manifest.ts';
import { stimulusUrl } from '../../lib/clips.ts';
import { buildManifest, parseManifest, readManifestFile, readWavDuration } from '../../lib/stimuli-manifest.ts';
import { loadAllClips } from '../../lib/stimuli.ts';
import { prepareStimuli } from '../../scripts/prepare-stimuli.ts';
import { writeTestWav } from '../fixtures/make-audio.ts';

const all = loadAllClips();

function corpus(clips = all, seconds = 0.5): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'stimuli-'));
  for (const c of clips) {
    mkdirSync(path.dirname(path.join(dir, c.relPath)), { recursive: true });
    writeTestWav(path.join(dir, c.relPath), seconds);
  }
  return dir;
}

test('the manifest holds exactly the referenced clips that exist, with sizes and WAV durations', () => {
  const keep = [all[0], all.find((c) => c.experiment === 2 && c.file.endsWith('.wav'))!];
  const dir = corpus(keep, 0.5);
  try {
    // A stray file that no stimulus list references is never servable.
    writeTestWav(path.join(dir, 'stray.wav'));
    const { manifest, missing } = buildManifest(dir, all, { repo: 'r', commit: 'c'.repeat(40) });
    assert.deepEqual(manifest.clips.map((c) => c.file).sort(), keep.map((c) => c.file).sort());
    assert.equal(missing.length, all.length - 2);
    for (const c of manifest.clips) {
      assert.equal(c.durationSec, 0.5);
      assert.ok(c.bytes > 44);
    }
    assert.deepEqual(clipsInManifest(manifest, all).map((c) => c.file).sort(), keep.map((c) => c.file).sort());
    assert.equal(readWavDuration(path.join(dir, 'missing.wav')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty, missing or malformed manifest is an explicit error', () => {
  assert.throws(() => clipsInManifest({ version: 1, source: null, clips: [] }, all), /none of the referenced clips/);
  assert.throws(() => readManifestFile('/nonexistent/stimuli-manifest.json'), /No stimuli manifest/);
  assert.throws(() => parseManifest('{"version":2,"clips":[]}'), /version 1/);
  // A path-like name could never be a basename the site serves.
  assert.throws(() => parseManifest('{"version":1,"clips":[{"file":"../x.wav","bytes":1}]}'), /bad manifest entry/);
});

test('prepare: strict by default, copies referenced clips flat, writes the manifest', () => {
  const some = all.filter((c) => c.file.endsWith('.wav')).slice(0, 4);
  const src = corpus(some);
  const out = mkdtempSync(path.join(tmpdir(), 'public-'));
  const manifestFile = path.join(out, 'manifest.json');
  try {
    assert.throws(
      () => prepareStimuli({ from: src, out: path.join(out, 'stimuli'), manifest: manifestFile, allowMissing: false, source: null }),
      /referenced clip\(s\) are missing/
    );
    const m = prepareStimuli({ from: src, out: path.join(out, 'stimuli'), manifest: manifestFile, allowMissing: true, source: null });
    assert.equal(m.clips.length, 4);
    assert.deepEqual(readdirSync(path.join(out, 'stimuli')).sort(), some.map((c) => c.file).sort());
    assert.deepEqual(parseManifest(readFileSync(manifestFile, 'utf8')), m);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('clips are served from /stimuli by basename, URL-encoded', () => {
  assert.equal(stimulusUrl('hume_focus_melon_2.wav'), '/stimuli/hume_focus_melon_2.wav');
  assert.equal(stimulusUrl('a b#.wav'), '/stimuli/a%20b%23.wav');
});
