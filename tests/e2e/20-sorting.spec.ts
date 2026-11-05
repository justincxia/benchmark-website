import { test, expect } from '@playwright/test';
import { rowOrder } from './helpers';

const LIST_ORDER = [
  'elevenlabs', 'elevenlabs_v4', 'gemini_tts', 'gemini_live', 'openai_tts', 'openai_sts',
  'hume', 'grok_tts', 'grok_sts', 'nova_sts', 'human',
];

test('default sort is Exp 1 focus accuracy (no Exp 1 data yet, so model-list order)', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('sort-exp1Focus')).toHaveAttribute('aria-pressed', 'true');
  expect(await rowOrder(page, 'lb')).toEqual(LIST_ORDER);
});

test('clicking Exp 2 interpretation accuracy sorts descending, — last', async ({ page }) => {
  await page.goto('/leaderboard');
  await page.getByTestId('sort-exp2Interp').click();
  await expect(page.getByTestId('sort-exp2Interp')).toHaveAttribute('aria-pressed', 'true');
  expect(await rowOrder(page, 'lb')).toEqual([
    'human', 'grok_tts', 'elevenlabs', 'hume', 'gemini_tts', 'openai_sts',
    'openai_tts', 'gemini_live', 'nova_sts', 'grok_sts', 'elevenlabs_v4',
  ]);
});

test('clicking Exp 2 naturalness sorts descending, — last', async ({ page }) => {
  await page.goto('/leaderboard');
  await page.getByTestId('sort-exp2Nat').click();
  expect(await rowOrder(page, 'lb')).toEqual([
    'grok_sts', 'elevenlabs', 'human', 'grok_tts', 'nova_sts', 'openai_sts',
    'openai_tts', 'hume', 'gemini_live', 'gemini_tts', 'elevenlabs_v4',
  ]);
});

test('every metric header is a sort control', async ({ page }) => {
  await page.goto('/leaderboard');
  for (const key of ['exp1Focus', 'exp1Nat', 'exp1Human', 'exp2Interp', 'exp2Nat']) {
    await page.getByTestId(`sort-${key}`).click();
    await expect(page.getByTestId(`sort-${key}`)).toHaveAttribute('aria-pressed', 'true');
  }
});
