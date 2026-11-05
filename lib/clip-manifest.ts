// Server-only. The single source of servable clips: every clip the stimulus CSVs reference
// that actually exists under AUDIO_DIR. app/api/audio/[file] and the response validator look
// a basename up here and use the entry's own relative path — request input is never joined
// into a filesystem path.

import { statSync } from 'node:fs';
import path from 'node:path';
import type { Clip } from './clips.ts';
import { loadAllClips } from './stimuli.ts';

export function audioDir(): string {
  return process.env.AUDIO_DIR ?? path.join(process.cwd(), 'data', 'audio');
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** The clips from `all` whose file exists in `dir`. Throws when none do, so a missing corpus
 *  is an explicit error rather than a player with nothing to play. */
export function readManifest(dir: string, all: Clip[]): Clip[] {
  let dirOk = false;
  try {
    dirOk = statSync(dir).isDirectory();
  } catch {
    dirOk = false;
  }
  if (!dirOk) throw new Error(`No stimulus directory at ${dir} — set AUDIO_DIR or run npm run copy-audio`);
  const clips = all.filter((c) => isFile(path.join(dir, c.relPath)));
  if (clips.length === 0) throw new Error(`No stimuli found in ${dir} — set AUDIO_DIR or run npm run copy-audio`);
  return clips;
}

export function clipPath(dir: string, clip: Clip): string {
  return path.join(dir, clip.relPath);
}

const g = globalThis as unknown as { __clipManifest?: Clip[] };

/** Process-cached manifest, mirroring how getDb() caches the database handle. */
export function getManifest(): Clip[] {
  if (!g.__clipManifest) g.__clipManifest = readManifest(audioDir(), loadAllClips());
  return g.__clipManifest;
}

export function findClip(file: string): Clip | undefined {
  return getManifest().find((c) => c.file === file);
}
