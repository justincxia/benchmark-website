// The one Supabase client, server-only. It authenticates with the service-role key, which
// bypasses RLS, so it must never reach a browser bundle: `server-only` makes any client-
// component import a build error. Plain-node entry points (scripts, unit tests) run with
// `--conditions=react-server` so this import resolves to the package's empty module.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TableName } from './types.ts';

const g = globalThis as unknown as { __supabase?: SupabaseClient };

/** The cached service-role client (like getDb() was). Throws if the env is missing. */
export function getSupabase(): SupabaseClient {
  if (!g.__supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see README "Setup")');
    }
    g.__supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return g.__supabase;
}

/** Drops the cached client (tests that switch env vars). */
export function resetSupabaseClient(): void {
  g.__supabase = undefined;
}

export function recordingsBucket(): string {
  return process.env.SUPABASE_RECORDINGS_BUCKET || 'recordings';
}

/** Throws a single readable Error for a PostgREST/Storage error object. */
export function check<T extends { error: { message: string; code?: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}${res.error.code ? ` (${res.error.code})` : ''}`);
  return res;
}

export async function countRows(table: TableName): Promise<number> {
  const res = check(await getSupabase().from(table).select('*', { count: 'exact', head: true }), `count ${table}`);
  return res.count ?? 0;
}
