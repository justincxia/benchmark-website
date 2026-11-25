import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('signed out: /account offers Sign in with Google, /record asks you to sign in', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByTestId('account-signed-out')).toBeVisible();
  await expect(page.getByTestId('google-sign-in')).toHaveText('Sign in with Google');
  await expect(page.getByTestId('google-sign-in')).toHaveAttribute('href', '/api/auth/login');

  await page.goto('/record');
  await expect(page.getByTestId('record-signed-out')).toContainText('sign in');
  await expect(page.getByTestId('record-signed-out').getByRole('link')).toHaveAttribute('href', '/account');
});

test('the login route redirects to Google with state, nonce and a PKCE S256 challenge', async ({ request }) => {
  const res = await request.get('/api/auth/login', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const loc = new URL(res.headers()['location']);
  expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  const q = loc.searchParams;
  expect(q.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
  expect(q.get('redirect_uri')).toBe('http://localhost:3100/api/auth/callback');
  expect(q.get('response_type')).toBe('code');
  expect(q.get('scope')).toBe('openid email profile');
  expect(q.get('code_challenge_method')).toBe('S256');
  expect(q.get('code_challenge')?.length).toBeGreaterThan(40);
  expect(q.get('state')?.length).toBeGreaterThan(20);
  expect(q.get('nonce')?.length).toBeGreaterThan(20);
  const setCookie = res.headers()['set-cookie'];
  expect(setCookie).toMatch(/pb_oauth=/);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=lax/i);
});

test('a callback without matching state is refused', async ({ request }) => {
  const res = await request.get('/api/auth/callback?code=x&state=forged', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()['location']).toMatch(/\/account\?error=signin$/);
});

test('signed in: name, email and Sign out; signing out returns to the signed-out view', async ({ page }) => {
  await signIn(page, 'alice', 'Alice Example', 'alice@example.test');
  await page.goto('/account');
  await expect(page.getByTestId('account-name')).toHaveText('Alice Example');
  await expect(page.getByTestId('account-email')).toHaveText('alice@example.test');
  await expect(page.getByTestId('recordings-empty')).toBeVisible();

  await page.getByTestId('sign-out').click();
  await expect(page.getByTestId('account-signed-out')).toBeVisible();
  await page.goto('/record');
  await expect(page.getByTestId('record-signed-out')).toBeVisible();
});

test('the session cookie is httpOnly and SameSite=Lax', async ({ page }) => {
  await signIn(page, 'cookie-check');
  const cookie = (await page.context().cookies()).find((c) => c.name === 'pb_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
});

test('leaderboard, experiment pages and arena work the same signed in', async ({ page }) => {
  await signIn(page, 'bob');
  await page.goto('/leaderboard?exp=2');
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText('69.9%');
  await page.goto('/leaderboard?exp=1');
  await expect(page.locator('h2').first()).toHaveText('Experiment 1: Focus');
  await page.goto('/arena');
  await expect(page.getByTestId('arena-mode-1')).toBeVisible();
});
