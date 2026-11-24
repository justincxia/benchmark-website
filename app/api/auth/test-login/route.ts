import { NextResponse } from 'next/server';
import { upsertUser } from '@/lib/db';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, cookieOptions, createSession, testBypassEnabled } from '@/lib/auth';

// E2E only: signs in as a made-up user without Google. Exists only when AUTH_TEST_BYPASS=1 and
// NODE_ENV is not production (Playwright sets the former; `next start` forces the latter).
export async function POST(request: Request) {
  if (!testBypassEnabled()) return new Response('Not found', { status: 404 });
  let body: { sub?: unknown; name?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 });
  }
  if (typeof body.sub !== 'string' || body.sub === '') return NextResponse.json({ error: 'sub required' }, { status: 400 });
  const user = await upsertUser({
    googleSub: `test:${body.sub}`,
    name: typeof body.name === 'string' ? body.name : null,
    email: typeof body.email === 'string' ? body.email : null,
  });
  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
  return res;
}
