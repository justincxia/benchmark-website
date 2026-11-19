// Server-only. Where Record-tab uploads live on disk. Filenames are generated here; nothing
// from the request is ever part of a path.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { extensionFor } from './recording-input.ts';

export function recordingsDir(): string {
  return process.env.RECORDINGS_DIR ?? path.join(process.cwd(), 'data', 'recordings');
}

/** Writes the bytes and returns the stored path, relative to RECORDINGS_DIR. */
export function saveRecordingFile(userId: number, mime: string, bytes: Uint8Array, dir = recordingsDir()): string {
  const rel = path.join(String(userId), `${randomUUID()}.${extensionFor(mime)}`);
  mkdirSync(path.join(dir, String(userId)), { recursive: true });
  writeFileSync(path.join(dir, rel), bytes);
  return rel;
}

export function recordingPath(rel: string, dir = recordingsDir()): string {
  return path.join(dir, rel);
}

export function removeRecordingFile(rel: string, dir = recordingsDir()): void {
  rmSync(path.join(dir, rel), { force: true });
}
