// Users and sessions. Tokens are never stored: sessions are keyed by the SHA-256 of the cookie.
import 'server-only';
import type { User } from './types.ts';

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented`);
};

/** Creates the user on first sign-in, refreshes email/name afterwards. */
export async function upsertUser(_u: { googleSub: string; email: string | null; name: string | null }): Promise<User> {
  return todo('upsertUser');
}

/** `expiresAt` is epoch milliseconds. */
export async function insertSession(_tokenHash: string, _userId: number, _expiresAt: number): Promise<void> {
  return todo('insertSession');
}

/** The session's user, or null when the session is unknown or expired (expired rows are removed). */
export async function userForSession(_tokenHash: string, _now: number): Promise<User | null> {
  return todo('userForSession');
}

export async function deleteSession(_tokenHash: string): Promise<void> {
  return todo('deleteSession');
}
