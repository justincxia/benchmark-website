// Recording metadata rows. The audio itself is in Storage (lib/recordings-store.ts).
import 'server-only';
import { check, getSupabase } from './client.ts';
import type { RecordingRow } from './types.ts';

const COLUMNS = 'id, user_id, experiment, prompt_id, created_at, mime, path, size';

interface DbRow {
  id: number | string;
  user_id: number | string;
  experiment: number;
  prompt_id: string;
  created_at: string;
  mime: string;
  path: string;
  size: number;
}

function toRow(r: DbRow): RecordingRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    experiment: r.experiment === 2 ? 2 : 1,
    promptId: r.prompt_id,
    createdAt: new Date(r.created_at).toISOString(),
    mime: r.mime,
    path: r.path,
    size: r.size,
  };
}

/** Returns the new row's id. */
export async function insertRecording(r: {
  userId: number;
  experiment: 1 | 2;
  promptId: string;
  mime: string;
  path: string;
  size: number;
}): Promise<number> {
  const res = check(
    await getSupabase()
      .from('recordings')
      .insert({ user_id: r.userId, experiment: r.experiment, prompt_id: r.promptId, mime: r.mime, path: r.path, size: r.size })
      .select('id')
      .single(),
    'insert recording'
  );
  return Number((res.data as { id: number | string }).id);
}

/** A user's recordings, newest first (id descending). */
export async function listRecordings(userId: number): Promise<RecordingRow[]> {
  // Paged: PostgREST caps one response at max_rows (1000).
  const PAGE = 1000;
  const out: RecordingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = check(
      await getSupabase()
        .from('recordings')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1),
      'list recordings'
    );
    const page = (res.data ?? []) as DbRow[];
    out.push(...page.map(toRow));
    if (page.length < PAGE) return out;
  }
}

/** One recording, only if it belongs to `userId`. */
export async function getRecording(id: number, userId: number): Promise<RecordingRow | null> {
  const res = check(
    await getSupabase().from('recordings').select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle(),
    'get recording'
  );
  return res.data ? toRow(res.data as DbRow) : null;
}

/** True when a row owned by `userId` was deleted. */
export async function deleteRecording(id: number, userId: number): Promise<boolean> {
  const res = check(
    await getSupabase().from('recordings').delete().eq('id', id).eq('user_id', userId).select('id'),
    'delete recording'
  );
  return (res.data ?? []).length > 0;
}
