import { DatabaseSync } from 'node:sqlite';
import { expect, type Page } from '@playwright/test';

export const DB_PATH = '.test-data/arena.db';

export function query<T>(sql: string): T {
  const db = new DatabaseSync(DB_PATH, { readOnly: true, timeout: 5000 });
  try {
    return db.prepare(sql).get() as T;
  } finally {
    db.close();
  }
}

export function countRows(table: 'exp1_trials' | 'exp2_trials' | 'responses'): number {
  return query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).n;
}

export function latestResponse(): Record<string, unknown> {
  return query<Record<string, unknown>>('SELECT * FROM responses ORDER BY id DESC LIMIT 1');
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
  await expect(audio).toHaveAttribute('src', /\/api\/audio\/.+\.(wav|mp3)$/, { timeout: 15_000 });
  const src = await audio.getAttribute('src');
  return decodeURIComponent(String(src).split('/').pop() as string);
}

export async function playThrough(page: Page) {
  await servedClip(page);
  await page.getByTestId('arena-play').click();
  await expect(page.getByTestId('arena-status')).toContainText('Ready', { timeout: 15_000 });
}

/** Opens the arena in a mode with a clean slate in localStorage for that page. */
export async function openArena(page: Page, mode: 1 | 2) {
  await page.goto('/arena');
  await page.getByTestId(`arena-mode-${mode}`).click();
  if (mode === 2) {
    const intro = page.getByTestId('arena-intro');
    if (await intro.isVisible().catch(() => false)) await page.getByTestId('arena-intro-continue').click();
  }
}
