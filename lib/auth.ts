// Server-only. Google sign-in (OpenID Connect, authorization code flow with state, nonce and
// PKCE), hand-rolled with fetch against Google's documented endpoints, plus cookie sessions
// stored in Supabase (lib/db). No Next imports here, so the unit tests can exercise all of it.

import { createHash, randomBytes } from 'node:crypto';
import { deleteSession, insertSession, userForSession, type User } from './db/index.ts';

export const SESSION_COOKIE = 'pb_session';
/** Holds state, nonce and PKCE verifier between /api/auth/login and the callback. */
export const OAUTH_COOKIE = 'pb_oauth';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OAUTH_TTL_SECONDS = 10 * 60;

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Environment lookup; process.env by default, a plain object in tests. */
type Env = Record<string, string | undefined>;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/** null when sign-in is not configured; the site then shows a note instead of the button. */
export function googleConfig(env: Env = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The e2e-only login bypass. Never on in production, whatever the env says. */
export function testBypassEnabled(env: Env = process.env): boolean {
  return env.AUTH_TEST_BYPASS === '1' && env.NODE_ENV !== 'production';
}

export function cookieOptions(maxAge: number, env: Env = process.env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}

/** Public origin of the app: APP_URL when set (required behind a proxy such as an HF Space),
 *  else the request's own origin. Google rejects any redirect URI not registered for the client. */
export function appOrigin(request: Request, env: Env = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/callback`;
}

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
}

export function newOAuthState(): OAuthState {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(48) };
}

export function authorizationUrl(cfg: GoogleConfig, redirect: string, s: OAuthState): string {
  const u = new URL(AUTHORIZE_URL);
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    state: s.state,
    nonce: s.nonce,
    code_challenge: pkceChallenge(s.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return u.toString();
}

export function parseOAuthCookie(value: string | undefined): OAuthState | null {
  if (!value) return null;
  try {
    const v = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<OAuthState>;
    if (typeof v.state === 'string' && typeof v.nonce === 'string' && typeof v.verifier === 'string') {
      return { state: v.state, nonce: v.nonce, verifier: v.verifier };
    }
  } catch {
    // fall through
  }
  return null;
}

export function serializeOAuthCookie(s: OAuthState): string {
  return Buffer.from(JSON.stringify(s), 'utf8').toString('base64url');
}

export interface IdentityClaims {
  sub: string;
  email: string | null;
  name: string | null;
}

/**
 * Checks the ID token's claims. The token comes straight from Google's token endpoint over
 * TLS in exchange for our code + client secret, which OpenID Connect Core §3.1.3.7 accepts in
 * place of a signature check; issuer, audience, expiry and nonce are still verified.
 */
export function validateIdClaims(
  claims: Record<string, unknown>,
  cfg: GoogleConfig,
  nonce: string,
  nowSeconds: number
): IdentityClaims | { error: string } {
  if (!ISSUERS.has(String(claims.iss))) return { error: 'bad issuer' };
  const aud = claims.aud;
  if (!(aud === cfg.clientId || (Array.isArray(aud) && aud.includes(cfg.clientId)))) return { error: 'bad audience' };
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return { error: 'token expired' };
  if (claims.nonce !== nonce) return { error: 'bad nonce' };
  if (typeof claims.sub !== 'string' || claims.sub === '') return { error: 'missing subject' };
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Exchanges the authorization code (with the PKCE verifier) and returns the verified identity. */
export async function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  s: OAuthState,
  redirect: string,
  fetchImpl: typeof fetch = fetch
): Promise<IdentityClaims> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
      code_verifier: s.verifier,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== 'string') throw new Error('no id_token in token response');
  const claims = validateIdClaims(decodeJwtPayload(body.id_token), cfg, s.nonce, Math.floor(Date.now() / 1000));
  if ('error' in claims) throw new Error(claims.error);
  return claims;
}

// ---- sessions ----

/** Creates a session and returns the cookie value (the raw token; only its hash is stored). */
export async function createSession(userId: number, nowMs = Date.now()): Promise<string> {
  const token = randomToken();
  await insertSession(hashToken(token), userId, nowMs + SESSION_TTL_SECONDS * 1000);
  return token;
}

export async function sessionUser(token: string | undefined, nowMs = Date.now()): Promise<User | null> {
  if (!token) return null;
  return userForSession(hashToken(token), nowMs);
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await deleteSession(hashToken(token));
}
