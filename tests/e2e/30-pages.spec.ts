import { test, expect } from '@playwright/test';
import { rowOrder } from './helpers';

test('/ redirects to /leaderboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/leaderboard$/);
});

test('sub-nav tabs are Leaderboard, Experiment 1, Experiment 2, Arena, in that order', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.locator('nav a')).toHaveText(['Leaderboard', 'Experiment 1', 'Experiment 2', 'Arena']);
});

test('all four pages render', async ({ page }) => {
  for (const [path, heading] of [
    ['/leaderboard', 'Leaderboard'],
    ['/experiment-1', 'Experiment 1: Focus'],
    ['/experiment-2', 'Experiment 2: Ambiguity'],
    ['/arena', 'Arena'],
  ]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText(heading);
    await expect(page).toHaveTitle('Prosody Bench');
  }
});

test('Experiment 1: one row per Exp 1 model with the three Exp 1 columns, and an example per model', async ({ page }) => {
  await page.goto('/experiment-1');
  const rows = await rowOrder(page, 'exp1');
  expect(rows).toHaveLength(10);
  expect(rows).not.toContain('human');
  await expect(page.locator('[data-testid^="exp1-"][data-testid$="-exp1Focus"]')).toHaveCount(10);
  await expect(page.locator('[data-testid$="-exp2Interp"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="example-"]')).toHaveCount(10);
  await expect(page.getByTestId('example-hume').locator('audio')).toHaveAttribute('src', '/api/audio/hume_focus_broad_1.wav');
  await expect(page.locator('body')).toContainText('has not been collected yet');
});

test('Experiment 2: one row per Exp 2 model with the two Exp 2 columns, and an example per model', async ({ page }) => {
  await page.goto('/experiment-2');
  const rows = await rowOrder(page, 'exp2');
  expect(rows).toHaveLength(10);
  expect(rows).not.toContain('elevenlabs_v4');
  await expect(page.getByTestId('exp2-human-exp2Interp')).toHaveText('69.9%');
  await expect(page.getByTestId('exp2-human-exp2Nat')).toHaveText('3.59');
  await expect(page.locator('[data-testid$="-exp1Focus"]')).toHaveCount(0);
  await expect(page.getByTestId('exp2-sentences')).toContainText('The servant of the actress who was crying left.');
  await expect(page.locator('[data-testid^="example-"]')).toHaveCount(10);
  await expect(page.getByTestId('example-human').locator('audio')).toHaveAttribute('src', '/api/audio/servant_a_1.wav');
  await expect(page.getByTestId('example-hume').locator('audio')).toHaveAttribute(
    'src',
    '/api/audio/hume_servant_actress_a_1.wav'
  );
});
