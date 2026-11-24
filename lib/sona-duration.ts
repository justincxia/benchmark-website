// Server-only. The SONA consent form's time estimate, from the real durations of the Exp 1
// clips in the manifest (read from their WAV headers; the audio itself is never loaded).

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { Clip } from './clips.ts';
import { clipPath } from './clip-manifest.ts';
import { estimateMinutes } from './sona.ts';
import { wavDurationSec } from './wav.ts';

/** Enough of the file to reach the `data` chunk header past any metadata chunks. */
const HEADER_BYTES = 64 * 1024;

/** The duration of the WAV at `filePath`, or null when it can't be read or parsed. */
export function readWavDuration(filePath: string): number | null {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const size = fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(HEADER_BYTES, size));
    const n = readSync(fd, buf, 0, buf.length, 0);
    return wavDurationSec(buf.subarray(0, n), size);
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** The durations of the readable Exp 1 WAVs among `clips`. */
export function exp1Durations(dir: string, clips: Clip[]): number[] {
  const out: number[] = [];
  for (const c of clips) {
    if (c.experiment !== 1 || !c.file.toLowerCase().endsWith('.wav')) continue;
    const d = readWavDuration(clipPath(dir, c));
    if (d !== null) out.push(d);
  }
  return out;
}

const g = globalThis as unknown as { __sonaMinutes?: { dir: string; minutes: number } };

/** "About N minutes" for the current manifest; cached per AUDIO_DIR for the process. */
export function sonaMinutes(dir: string, clips: Clip[]): number {
  if (g.__sonaMinutes?.dir !== dir) g.__sonaMinutes = { dir, minutes: estimateMinutes(exp1Durations(dir, clips)) };
  return g.__sonaMinutes.minutes;
}
