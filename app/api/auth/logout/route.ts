import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { SESSION_COOKIE, endSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  endSession(getDb(), request.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
