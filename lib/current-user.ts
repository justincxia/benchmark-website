// Server-only: the signed-in user for a server component or route handler, from the session
// cookie. Returns null when signed out.

import { cookies } from 'next/headers';
import type { User } from './db/index.ts';
import { SESSION_COOKIE, sessionUser } from './auth.ts';

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionUser(token);
}
