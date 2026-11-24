// Shared by the unit tests that touch the database. They run against the local Supabase stack
// (npm run test:unit wraps them in scripts/with-local-supabase.ts) and refuse any other host.
import { randomUUID } from 'node:crypto';
import { getSupabase } from '../lib/db/client.ts';
import type { TableName } from '../lib/db/types.ts';

export function assertLocalSupabase(): void {
  const url = process.env.SUPABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`DB tests only run against a local Supabase; SUPABASE_URL is ${url || 'unset'}. Use npm run test:unit.`);
  }
}

/** A unique tag for this test run: use it in keys (google_sub, participant, …) so tests that
 *  share the one local database never see each other's rows. */
export function uniq(prefix = 't'): string {
  return `${prefix}-${randomUUID()}`;
}

const PK: Record<TableName, string> = {
  exp1_trials: 'id',
  exp2_trials: 'id',
  responses: 'id',
  users: 'id',
  sessions: 'token_hash',
  recordings: 'id',
  sona_sessions: 'id',
  sona_responses: 'id',
  sona_contacts: 'id',
};

/** Deletes every row of `table`. Only for tables the calling test file owns outright. */
export async function emptyTable(table: TableName): Promise<void> {
  assertLocalSupabase();
  const { error } = await getSupabase().from(table).delete().not(PK[table], 'is', null);
  if (error) throw new Error(`empty ${table}: ${error.message}`);
}
