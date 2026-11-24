import { NextResponse } from 'next/server';
import {
  OAUTH_COOKIE,
  OAUTH_TTL_SECONDS,
  appOrigin,
  authorizationUrl,
  cookieOptions,
  googleConfig,
  newOAuthState,
  redirectUri,
  serializeOAuthCookie,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Starts Google sign-in: remembers state/nonce/PKCE verifier in a short-lived cookie and
 *  sends the browser to Google. */
export async function GET(request: Request) {
  const origin = appOrigin(request);
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL('/account', origin));
  const s = newOAuthState();
  const res = NextResponse.redirect(authorizationUrl(cfg, redirectUri(origin), s));
  res.cookies.set(OAUTH_COOKIE, serializeOAuthCookie(s), cookieOptions(OAUTH_TTL_SECONDS));
  return res;
}
