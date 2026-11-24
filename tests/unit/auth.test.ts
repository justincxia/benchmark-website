import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { upsertUser } from '../../lib/db/auth.ts';
import { getSupabase } from '../../lib/db/client.ts';
import { assertLocalSupabase, uniq } from '../db.ts';
import {
  authorizationUrl,
  cookieOptions,
  createSession,
  decodeJwtPayload,
  endSession,
  exchangeCode,
  googleConfig,
  hashToken,
  newOAuthState,
  parseOAuthCookie,
  pkceChallenge,
  serializeOAuthCookie,
  sessionUser,
  testBypassEnabled,
  validateIdClaims,
  SESSION_TTL_SECONDS,
} from '../../lib/auth.ts';

const cfg = { clientId: 'cid', clientSecret: 'secret' };

test('sign-in is configured only with both Google credentials', () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'a' }), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: ' ' }), null);
  assert.deepEqual(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), { clientId: 'a', clientSecret: 'b' });
});

test('the test login bypass never works in production', () => {
  assert.equal(testBypassEnabled({ AUTH_TEST_BYPASS: '1', NODE_ENV: 'development' }), true);
  assert.equal(testBypassEnabled({ AUTH_TEST_BYPASS: '1', NODE_ENV: 'production' }), false);
  assert.equal(testBypassEnabled({ NODE_ENV: 'development' }), false);
});

test('cookies are httpOnly, SameSite=Lax, and secure only in production', () => {
  assert.deepEqual(cookieOptions(60, { NODE_ENV: 'production' }), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 });
  assert.equal(cookieOptions(60, { NODE_ENV: 'development' }).secure, false);
});

test('PKCE challenge is the base64url SHA-256 of the verifier (RFC 7636 example)', () => {
  assert.equal(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('the authorization URL carries state, nonce and an S256 challenge, never the verifier', () => {
  const s = newOAuthState();
  const u = new URL(authorizationUrl(cfg, 'http://localhost:3000/api/auth/callback', s));
  assert.equal(u.searchParams.get('state'), s.state);
  assert.equal(u.searchParams.get('nonce'), s.nonce);
  assert.equal(u.searchParams.get('code_challenge'), pkceChallenge(s.verifier));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(!u.toString().includes(s.verifier));
});

test('the OAuth cookie round-trips and rejects garbage', () => {
  const s = newOAuthState();
  assert.deepEqual(parseOAuthCookie(serializeOAuthCookie(s)), s);
  assert.equal(parseOAuthCookie('not-json'), null);
  assert.equal(parseOAuthCookie(undefined), null);
});

const now = 1_700_000_000;
const good = { iss: 'https://accounts.google.com', aud: 'cid', exp: now + 60, nonce: 'n', sub: '123', email: 'a@b.c', name: 'A' };

test('ID token claims: issuer, audience, expiry, nonce and subject are all checked', () => {
  assert.deepEqual(validateIdClaims(good, cfg, 'n', now), { sub: '123', email: 'a@b.c', name: 'A' });
  assert.ok('error' in validateIdClaims({ ...good, iss: 'https://evil' }, cfg, 'n', now));
  assert.ok('error' in validateIdClaims({ ...good, aud: 'other' }, cfg, 'n', now));
  assert.ok('error' in validateIdClaims({ ...good, exp: now - 1 }, cfg, 'n', now));
  assert.ok('error' in validateIdClaims({ ...good, nonce: 'x' }, cfg, 'n', now));
  assert.ok('error' in validateIdClaims({ ...good, sub: '' }, cfg, 'n', now));
});

test('exchangeCode posts code + verifier and returns the verified identity', async () => {
  const s = newOAuthState();
  const payload = Buffer.from(JSON.stringify({ ...good, nonce: s.nonce, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  let sent: URLSearchParams | null = null;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent = new URLSearchParams(String(init.body));
    return new Response(JSON.stringify({ id_token: `h.${payload}.sig` }), { status: 200 });
  }) as unknown as typeof fetch;
  const id = await exchangeCode(cfg, 'the-code', s, 'http://x/cb', fakeFetch);
  assert.equal(id.sub, '123');
  assert.equal(sent!.get('code_verifier'), s.verifier);
  assert.equal(sent!.get('code'), 'the-code');
  assert.equal(sent!.get('grant_type'), 'authorization_code');
  await assert.rejects(exchangeCode(cfg, 'c', { ...s, nonce: 'other' }, 'http://x/cb', fakeFetch), /nonce/);
  assert.deepEqual(decodeJwtPayload(`h.${payload}.sig`).sub, '123');
});

// ---- users and sessions, against the shared local Supabase: only this file's own rows ----

assertLocalSupabase();
const myUserIds: number[] = [];

after(async () => {
  // Sessions cascade with their user.
  if (myUserIds.length === 0) return;
  const { error } = await getSupabase().from('users').delete().in('id', myUserIds);
  if (error) throw new Error(`cleanup: ${error.message}`);
});

async function sessionsOf(userId: number): Promise<{ tokenHash: string; expiresAt: number }[]> {
  const { data, error } = await getSupabase().from('sessions').select('token_hash, expires_at').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ tokenHash: String(r.token_hash), expiresAt: Number(r.expires_at) }));
}

test('sessions: only the token hash is stored; lookup, expiry and sign-out', async () => {
  const user = await upsertUser({ googleSub: uniq('g'), email: 'a@b.c', name: 'A' });
  myUserIds.push(user.id);
  const t0 = Date.now();
  const token = await createSession(user.id, t0);
  const stored = await sessionsOf(user.id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.notEqual(stored[0].tokenHash, token);
  assert.equal(hashToken(token), stored[0].tokenHash);
  assert.equal(stored[0].expiresAt, t0 + SESSION_TTL_SECONDS * 1000);

  assert.deepEqual(await sessionUser(token, t0), user);
  assert.equal(await sessionUser('wrong', t0), null);
  assert.equal(await sessionUser(undefined, t0), null);
  // Valid until the last millisecond; expired: refused and removed.
  assert.equal((await sessionUser(token, t0 + SESSION_TTL_SECONDS * 1000 - 1))?.id, user.id);
  assert.equal(await sessionUser(token, t0 + SESSION_TTL_SECONDS * 1000 + 1), null);
  assert.equal((await sessionsOf(user.id)).length, 0);

  const t2 = await createSession(user.id);
  assert.equal((await sessionUser(t2))?.id, user.id);
  await endSession(t2);
  assert.equal(await sessionUser(t2), null);
  assert.equal((await sessionsOf(user.id)).length, 0);
  await endSession(undefined); // no-op without a cookie
});

test('upsertUser keeps one row per Google subject and refreshes name/email', async () => {
  const sub = uniq('g');
  const a = await upsertUser({ googleSub: sub, email: 'old@x', name: 'Old' });
  myUserIds.push(a.id);
  const b = await upsertUser({ googleSub: sub, email: 'new@x', name: 'New' });
  assert.equal(a.id, b.id);
  assert.equal(b.googleSub, sub);
  assert.equal(b.email, 'new@x');
  assert.equal(b.name, 'New');
  const { count, error } = await getSupabase()
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('google_sub', sub);
  if (error) throw new Error(error.message);
  assert.equal(count, 1);
});
