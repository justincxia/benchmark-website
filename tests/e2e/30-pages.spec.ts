import { test, expect } from '@playwright/test';

test('/ is the intro page, not a redirect', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('intro')).toBeVisible();
});

test('sub-nav tabs are Leaderboard, Arena, Record, in that order', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.locator('nav a')).toHaveText(['Leaderboard', 'Arena', 'Record']);
});

test('the leaderboard and arena render', async ({ page }) => {
  for (const [path, heading] of [
    ['/leaderboard', 'Leaderboard'],
    ['/leaderboard?exp=1', 'Leaderboard'],
    ['/leaderboard?exp=2', 'Leaderboard'],
    ['/arena', 'Arena'],
  ]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText(heading);
    await expect(page).toHaveTitle('Prosody Bench');
  }
});

test('the old experiment addresses lead to the matching leaderboard view', async ({ page }) => {
  await page.goto('/experiment-1');
  await expect(page).toHaveURL(/\/leaderboard\?exp=1$/);
  await expect(page.locator('h2').first()).toHaveText('Experiment 1: Focus');
  await page.goto('/experiment-2');
  await expect(page).toHaveURL(/\/leaderboard\?exp=2$/);
  await expect(page.locator('h2').first()).toHaveText('Experiment 2: Ambiguity');
});

test('Experiment 1: an example clip per model', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  await expect(page.locator('[data-testid^="example-"]')).toHaveCount(10);
  await expect(page.getByTestId('example-hume').locator('audio')).toHaveAttribute('src', '/stimuli/hume_focus_broad_1.wav');
});

test('Experiment 2: an example clip per model', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await expect(page.locator('[data-testid^="example-"]')).toHaveCount(10);
  await expect(page.getByTestId('example-human').locator('audio')).toHaveAttribute('src', '/stimuli/servant_a_1.wav');
  await expect(page.getByTestId('example-hume').locator('audio')).toHaveAttribute(
    'src',
    '/stimuli/hume_servant_actress_a_1.wav'
  );
});
