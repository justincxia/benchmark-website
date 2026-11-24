// Users and sessions. Tokens are never stored: sessions are keyed by the SHA-256 of the cookie.
import 'server-only';
import { check, getSupabase } from './client.ts';
import type { User } from './types.ts';

interface UserRow {
  id: number | string;
  google_sub: string;
  email: string | null;
  name: string | null;
}

function toUser(r: UserRow): User {
  return { id: Number(r.id), googleSub: r.google_sub, email: r.email, name: r.name };
}

/** Creates the user on first sign-in, refreshes email/name afterwards. */
export async function upsertUser(u: { googleSub: string; email: string | null; name: string | null }): Promise<User> {
  const res = check(
    await getSupabase()
      .from('users')
      .upsert({ google_sub: u.googleSub, email: u.email, name: u.name }, { onConflict: 'google_sub' })
      .select('id, google_sub, email, name')
      .single<UserRow>(),
    'upsert user'
  );
  return toUser(res.data!);
}

/** `expiresAt` is epoch milliseconds. */
export async function insertSession(tokenHash: string, userId: number, expiresAt: number): Promise<void> {
  check(
    await getSupabase().from('sessions').insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt }),
    'insert session'
  );
}

/** The session's user, or null when the session is unknown or expired (expired rows are removed). */
export async function userForSession(tokenHash: string, now: number): Promise<User | null> {
  const res = check(
    await getSupabase()
      .from('sessions')
      .select('expires_at, users!inner(id, google_sub, email, name)')
      .eq('token_hash', tokenHash)
      .maybeSingle<{ expires_at: number | string; users: UserRow }>(),
    'session lookup'
  );
  const row = res.data;
  if (!row) return null;
  // bigint may come back as a number or a string; compare numerically either way.
  if (Number(row.expires_at) <= now) {
    await deleteSession(tokenHash);
    return null;
  }
  return toUser(row.users);
}

export async function deleteSession(tokenHash: string): Promise<void> {
  check(await getSupabase().from('sessions').delete().eq('token_hash', tokenHash), 'delete session');
}
