// Generates tiny silent wavs at the corpus's relative paths for the e2e suite, so nothing under
// tests/ depends on the gitignored data/audio/. Only clips whose stimulus extension is .wav are
// written (the Exp 2 ElevenLabs clips are .mp3 and are simply absent from the test manifest).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAllClips } from '../../lib/stimuli.ts';

/** A mono 16 kHz 16-bit PCM wav of silence: long enough for `ended` to be observable. */
export function writeTestWav(filePath: string, seconds = 0.3): void {
  const rate = 16000;
  const samples = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples * 2, 40);
  writeFileSync(filePath, buf);
}

export function writeTestCorpus(dir: string): number {
  rmSync(dir, { recursive: true, force: true });
  let n = 0;
  for (const c of loadAllClips()) {
    if (!c.file.endsWith('.wav')) continue;
    const p = path.join(dir, c.relPath);
    mkdirSync(path.dirname(p), { recursive: true });
    writeTestWav(p);
    n++;
  }
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? path.join(process.cwd(), '.test-data', 'audio');
  console.log(`Wrote ${writeTestCorpus(dir)} test stimuli to ${dir}`);
}
