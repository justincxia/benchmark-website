import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, endSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await endSession(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (e) {
    // Still clear the cookie: the server-side row then just expires on its own.
    console.error('logout: could not delete session', e);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
