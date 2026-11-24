// Server-only. The single source of servable clips: every clip the stimulus CSVs reference
// that the stimuli manifest (lib/stimuli-manifest.ts) lists as present. The arena, the SONA
// survey and the response validators look a basename up here; request input is never used to
// build a path. Browsers load the audio itself from /stimuli/<file>.

import path from 'node:path';
import type { Clip } from './clips.ts';
import { loadAllClips } from './stimuli.ts';
import { readManifestFile, type StimuliManifest } from './stimuli-manifest.ts';

/** The clips from `all` that `manifest` lists. Throws when none are, so a missing corpus is an
 *  explicit error rather than a player with nothing to play. */
export function clipsInManifest(manifest: StimuliManifest, all: Clip[]): Clip[] {
  const present = new Set(manifest.clips.map((c) => c.file));
  const clips = all.filter((c) => present.has(c.file));
  if (clips.length === 0) throw new Error('The stimuli manifest lists none of the referenced clips: run npm run copy-audio');
  return clips;
}

const g = globalThis as unknown as { __clipManifest?: { clips: Clip[]; durations: Map<string, number | null> } };

function load() {
  if (!g.__clipManifest) {
    const manifest = readManifestFile();
    g.__clipManifest = {
      clips: clipsInManifest(manifest, loadAllClips()),
      durations: new Map(manifest.clips.map((c) => [c.file, c.durationSec])),
    };
  }
  return g.__clipManifest;
}

/** Process-cached list of servable clips. */
export function getManifest(): Clip[] {
  return load().clips;
}

export function findClip(file: string): Clip | undefined {
  return getManifest().find((c) => c.file === file);
}

/** Seconds, from the manifest; null when unknown. */
export function clipDuration(file: string): number | null {
  return load().durations.get(file) ?? null;
}

/** Where to serve audio from disk instead of the CDN (local test runs: AUDIO_DIR). Null on
 *  Vercel, where the files are static assets. */
export function diskAudioDir(): string | null {
  return process.env.AUDIO_DIR ? path.resolve(process.env.AUDIO_DIR) : null;
}
