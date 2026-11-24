// Recording metadata rows. The audio itself is in Storage (lib/recordings-store.ts).
import 'server-only';
import type { RecordingRow } from './types.ts';

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented`);
};

/** Returns the new row's id. */
export async function insertRecording(_r: {
  userId: number;
  experiment: 1 | 2;
  promptId: string;
  mime: string;
  path: string;
  size: number;
}): Promise<number> {
  return todo('insertRecording');
}

/** A user's recordings, newest first (id descending). */
export async function listRecordings(_userId: number): Promise<RecordingRow[]> {
  return todo('listRecordings');
}

/** One recording, only if it belongs to `userId`. */
export async function getRecording(_id: number, _userId: number): Promise<RecordingRow | null> {
  return todo('getRecording');
}

/** True when a row owned by `userId` was deleted. */
export async function deleteRecording(_id: number, _userId: number): Promise<boolean> {
  return todo('deleteRecording');
}
