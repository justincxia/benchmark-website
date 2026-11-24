// Server-only: the signed-in user for a route handler's request.
import type { NextRequest } from 'next/server';
import type { User } from './db/index.ts';
import { SESSION_COOKIE, sessionUser } from './auth.ts';

export async function requestUser(request: NextRequest): Promise<User | null> {
  return sessionUser(request.cookies.get(SESSION_COOKIE)?.value);
}
