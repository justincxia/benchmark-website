// Server-only: the signed-in user for a route handler's request.
import type { NextRequest } from 'next/server';
import { getDb, type User } from './db.ts';
import { SESSION_COOKIE, sessionUser } from './auth.ts';

export function requestUser(request: NextRequest): User | null {
  return sessionUser(getDb(), request.cookies.get(SESSION_COOKIE)?.value);
}
