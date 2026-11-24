// Server-only (Node fs). The stimuli manifest: which referenced clips exist, their size and
// duration. It is written once, when the audio is prepared (scripts/prepare-stimuli.ts, run by
// `npm run copy-audio` locally and by the Vercel build), so nothing at request time has to look
// at the audio files themselves. On Vercel they are static files on the CDN (public/stimuli/),
// which a server function cannot read; the manifest is traced into every function instead
// (outputFileTracingIncludes in next.config.ts).

import { closeSync, fstatSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Clip } from './clips.ts';
import { wavDurationSec } from './wav.ts';

export interface ManifestEntry {
  /** Clip basename; also its URL, /stimuli/<file>. */
  file: string;
  bytes: number;
  /** From the WAV header; null for non-WAV clips (a few Exp 2 mp3s) or unreadable headers. */
  durationSec: number | null;
}

export interface StimuliManifest {
  version: 1;
  /** Where the audio came from: the pinned tts-sts-audio commit, or null for a local copy. */
  source: { repo: string; commit: string } | null;
  clips: ManifestEntry[];
}

export function manifestPath(): string {
  return process.env.STIMULI_MANIFEST ?? path.join(process.cwd(), 'data', 'stimuli-manifest.json');
}

/** Enough of a WAV to reach its `data` chunk header past any metadata chunks. */
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

/** Builds the manifest for the clips of `all` present under `dir` (tts-sts-audio layout).
 *  Returns the missing ones too, so a caller can decide whether that is fatal. */
export function buildManifest(
  dir: string,
  all: Clip[],
  source: StimuliManifest['source'] = null
): { manifest: StimuliManifest; missing: Clip[] } {
  const clips: ManifestEntry[] = [];
  const missing: Clip[] = [];
  for (const c of all) {
    const p = path.join(dir, c.relPath);
    let bytes: number;
    try {
      const st = statSync(p);
      if (!st.isFile()) throw new Error('not a file');
      bytes = st.size;
    } catch {
      missing.push(c);
      continue;
    }
    clips.push({ file: c.file, bytes, durationSec: c.file.toLowerCase().endsWith('.wav') ? readWavDuration(p) : null });
  }
  return { manifest: { version: 1, source, clips }, missing };
}

/** Parses and sanity-checks a manifest file's text. */
export function parseManifest(text: string): StimuliManifest {
  const m = JSON.parse(text) as StimuliManifest;
  if (m?.version !== 1 || !Array.isArray(m.clips)) throw new Error('not a stimuli manifest (version 1)');
  for (const c of m.clips) {
    if (typeof c?.file !== 'string' || !/^[^/\\]+$/.test(c.file) || typeof c.bytes !== 'number') {
      throw new Error(`bad manifest entry: ${JSON.stringify(c)}`);
    }
  }
  return m;
}

export function readManifestFile(file = manifestPath()): StimuliManifest {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No stimuli manifest at ${file}: run npm run copy-audio (or npm run fetch-stimuli)`);
  }
  return parseManifest(text);
}
