import { test, expect } from '@playwright/test';
import { db, rowOrder } from './helpers';

test('Experiment 2 opens sorted by its first column with data, interpretation accuracy', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await expect(page.getByTestId('sort-exp2Interp')).toHaveAttribute('aria-pressed', 'true');
  expect(await rowOrder(page, 'lb')).toEqual([
    'human', 'grok_tts', 'elevenlabs', 'hume', 'gemini_tts', 'openai_sts',
    'openai_tts', 'gemini_live', 'nova_sts', 'grok_sts',
  ]);
});

test('Experiment 1 opens sorted by focus accuracy; ties keep model-list order', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  await expect(page.getByTestId('sort-exp1Focus')).toHaveAttribute('aria-pressed', 'true');
  // openai_sts and hume tie at 10.0% and stay in model-list order.
  expect(await rowOrder(page, 'lb')).toEqual([
    'nova_sts', 'openai_tts', 'elevenlabs_v4', 'elevenlabs', 'grok_tts', 'gemini_tts', 'grok_sts', 'gemini_live', 'openai_sts', 'hume',
  ]);
});

test('clicking Naturalness sorts descending', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await page.getByTestId('sort-exp2Nat').click();
  await expect(page.getByTestId('sort-exp2Nat')).toHaveAttribute('aria-pressed', 'true');
  expect(await rowOrder(page, 'lb')).toEqual([
    'grok_sts', 'elevenlabs', 'human', 'grok_tts', 'nova_sts', 'openai_sts',
    'openai_tts', 'hume', 'gemini_live', 'gemini_tts',
  ]);
});

test('every metric header is a sort control, and the sort resets when the experiment changes', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  for (const key of ['exp1Focus', 'exp1Nat', 'exp1Human']) {
    await page.getByTestId(`sort-${key}`).click();
    await expect(page.getByTestId(`sort-${key}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('exp-switch-2').click();
  await expect(page.getByTestId('sort-exp2Interp')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sort-exp2Nat').click();
  await expect(page.getByTestId('sort-exp2Nat')).toHaveAttribute('aria-pressed', 'true');
});

// Accuracy per model over a set of sentences, straight from the seeded table, formatted like the app.
async function accuracyOver(conditions: string[]): Promise<Record<string, string>> {
  // Read the raw rows (PostgREST caps a response at 1000 rows, so page through them) and count
  // here, independently of the views the app reads.
  type Row = { provider: string; interpretation: string | null; intended_interpretation: string };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('exp2_trials')
      .select('provider, interpretation, intended_interpretation')
      .eq('is_attention_check', false)
      .in('condition', conditions)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const acc: Record<string, { n: number; k: number }> = {};
  for (const r of rows as { provider: string; interpretation: string | null; intended_interpretation: string }[]) {
    if (r.interpretation === null) continue;
    const a = (acc[r.provider] ??= { n: 0, k: 0 });
    a.n += 1;
    if (r.interpretation === r.intended_interpretation) a.k += 1;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([p, { n, k }]) => [p, (Math.round((k * 1000) / n) / 10).toFixed(1) + '%'])
  );
}

const SENTENCES = ['servant_actress', 'lisa_telescope', 'mirror_hallway', 'old_men_women', 'knife_towel_box'];

test('the Sentences dropdown beside Interpretation accuracy picks which sentences count', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  const filter = page.getByTestId('sentence-filter');
  await expect(filter).toHaveText(/All sentences/);
  await expect(page.getByTestId('sentence-menu')).toHaveCount(0);
  // It sits in the Interpretation accuracy header cell, next to the sort control.
  expect(await filter.evaluate((el) => !!el.parentElement?.querySelector('[data-testid="sort-exp2Interp"]'))).toBe(true);

  await filter.click();
  await expect(page.getByTestId('sentence-menu')).toBeVisible();
  for (const s of SENTENCES) await expect(page.getByTestId(`sentence-check-${s}`)).toBeChecked();
  await expect(page.getByTestId('sentence-menu')).toContainText('The servant of the actress who was crying left.');

  // Uncheck two sentences: accuracy is recomputed over the other three, naturalness is not.
  await page.getByTestId('sentence-check-lisa_telescope').uncheck();
  await page.getByTestId('sentence-check-knife_towel_box').uncheck();
  await expect(filter).toHaveText(/3 of 5 sentences/);
  const three = await accuracyOver(['servant_actress', 'mirror_hallway', 'old_men_women']);
  expect(Object.keys(three)).toHaveLength(10);
  for (const [model, pct] of Object.entries(three)) {
    await expect(page.getByTestId(`lb-${model}-exp2Interp`)).toHaveText(pct);
  }
  await expect(page.getByTestId('lb-human-exp2Nat')).toHaveText('3.59');
  expect(three.human).not.toBe('69.9%');

  // The table (sorted by accuracy) and the accuracy chart reorder to match.
  const order = await rowOrder(page, 'lb');
  const values = order.map((m) => parseFloat(three[m]));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expect(page.getByTestId(`chart-exp2Interp-${order[0]}`)).toContainText(three[order[0]]);
  await expect(page.locator('[data-testid^="chart-exp2Interp-"]').first()).toHaveAttribute('data-testid', `chart-exp2Interp-${order[0]}`);

  // Down to one sentence: the last checked box cannot be unchecked.
  await page.getByTestId('sentence-check-servant_actress').uncheck();
  await page.getByTestId('sentence-check-mirror_hallway').uncheck();
  await expect(filter).toHaveText(/1 of 5 sentences/);
  await expect(page.getByTestId('sentence-check-old_men_women')).toBeDisabled();
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText((await accuracyOver(['old_men_women'])).human);

  // Check all restores the full numbers; Escape closes the menu.
  await page.getByTestId('sentence-all').click();
  await expect(filter).toHaveText(/All sentences/);
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText('69.9%');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sentence-menu')).toHaveCount(0);
});

test('the Sentences menu stays on screen at phone width, and Experiment 1 has no such menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/leaderboard?exp=2');
  await page.getByTestId('sentence-filter').scrollIntoViewIfNeeded();
  await page.getByTestId('sentence-filter').click();
  const box = await page.getByTestId('sentence-menu').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.goto('/leaderboard?exp=1');
  await expect(page.getByTestId('sentence-filter')).toHaveCount(0);
});
