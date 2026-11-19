import { NextResponse, type NextRequest } from 'next/server';
import { getDb, upsertUser } from '@/lib/db';
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  appOrigin,
  cookieOptions,
  createSession,
  exchangeCode,
  googleConfig,
  parseOAuthCookie,
  redirectUri,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const fail = () => {
    const res = NextResponse.redirect(new URL('/account?error=signin', origin));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const cfg = googleConfig();
  const saved = parseOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  if (!cfg || !saved || !code || params.get('state') !== saved.state) return fail();

  try {
    const identity = await exchangeCode(cfg, code, saved, redirectUri(origin));
    const db = getDb();
    const user = upsertUser(db, { googleSub: identity.sub, email: identity.email, name: identity.name });
    const token = createSession(db, user.id);
    const res = NextResponse.redirect(new URL('/account', origin));
    res.cookies.delete(OAUTH_COOKIE);
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch {
    return fail();
  }
}
