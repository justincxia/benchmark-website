import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

// The e2e suite reads the same local Supabase the test server writes to. `npm run test:e2e`
// fills SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from `supabase status` (local only). This is a
// plain client, not lib/db (which is `server-only` and so can't load in the Playwright runner).
let client: SupabaseClient | undefined;
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Run the e2e suite with `npm run test:e2e` (needs the local Supabase env)');
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) throw new Error(`e2e refuses a non-local SUPABASE_URL: ${url}`);
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`);
  return res.data;
}

export async function countRows(table: 'exp1_trials' | 'exp2_trials' | 'responses' | 'sona_sessions' | 'sona_responses' | 'sona_contacts'): Promise<number> {
  const res = await db().from(table).select('*', { count: 'exact', head: true });
  if (res.error) throw new Error(`count ${table}: ${res.error.message}`);
  return res.count ?? 0;
}

export async function latestResponse(): Promise<Record<string, unknown>> {
  return ok<Record<string, unknown>>(await db().from('responses').select('*').order('id', { ascending: false }).limit(1).single(), 'latest response');
}

export async function userIdBySub(googleSub: string): Promise<number> {
  return ok<{ id: number }>(await db().from('users').select('id').eq('google_sub', googleSub).single(), 'user').id;
}

export async function recordingsOf(userId: number): Promise<{ id: number; path: string; mime: string; prompt_id: string; experiment: number }[]> {
  return ok<{ id: number; path: string; mime: string; prompt_id: string; experiment: number }[]>(await db().from('recordings').select('id, path, mime, prompt_id, experiment').eq('user_id', userId), 'recordings');
}

export async function recordingById(id: number): Promise<{ path: string; experiment: number }> {
  return ok<{ path: string; experiment: number }>(await db().from('recordings').select('path, experiment').eq('id', id).single(), 'recording');
}

/** Whether `key` exists in the recordings bucket. */
export async function recordingObjectExists(key: string): Promise<boolean> {
  const bucket = process.env.SUPABASE_RECORDINGS_BUCKET || 'recordings';
  const slash = key.lastIndexOf('/');
  const res = await db().storage.from(bucket).list(key.slice(0, slash), { search: key.slice(slash + 1) });
  if (res.error) throw new Error(`list ${key}: ${res.error.message}`);
  return (res.data ?? []).some((o) => o.name === key.slice(slash + 1));
}
/** Row keys of a metric table, in rendered order. */
export async function rowOrder(page: Page, testId: string): Promise<string[]> {
  const ids = await page.locator(`[data-testid^="${testId}-row-"]`).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid') ?? '')
  );
  return ids.map((id) => id.slice(`${testId}-row-`.length));
}

/** The clip the arena is showing, read off the audio element (attached after hydration). */
export async function servedClip(page: Page): Promise<string> {
  const audio = page.getByTestId('arena-audio');
  await expect(audio).toHaveAttribute('src', /\/stimuli\/.+\.(wav|mp3)$/, { timeout: 15_000 });
  const src = await audio.getAttribute('src');
  return decodeURIComponent(String(src).split('/').pop() as string);
}

export async function playThrough(page: Page) {
  await servedClip(page);
  await page.getByTestId('arena-play').click();
  // `ended` and not just the page's "played" flag, which stays set on a replay.
  await expect
    .poll(() => page.getByTestId('arena-audio').evaluate((a) => (a as HTMLAudioElement).ended), { timeout: 15_000 })
    .toBe(true);
  await expect(page.getByTestId('arena-clip')).toHaveAttribute('data-completed', 'true');
}

/** Opens the arena in a mode with a clean slate for that page, past the start screen (and, in
 *  Experiment 2, past the sentence screen). */
export async function openArena(page: Page, mode: 1 | 2) {
  await page.goto('/arena');
  await page.getByTestId(`arena-mode-${mode}`).click();
  await page.getByTestId('arena-play-now').click();
  await expect(page.getByTestId('arena-game')).toBeVisible();
  if (mode === 2) await page.getByTestId('arena-intro-continue').click();
}

/** Signs the page's browser context in as a test user via the e2e-only bypass. */
export async function signIn(page: Page, sub: string, name = `Test ${sub}`, email = `${sub}@example.test`) {
  const res = await page.request.post('/api/auth/test-login', { data: { sub, name, email } });
  expect(res.status()).toBe(200);
}
