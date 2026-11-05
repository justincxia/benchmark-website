import { test, expect } from '@playwright/test';

// Exp 2 metrics per model from seed/exp2_results.csv (attention checks and unanswered
// questions excluded), computed independently of the app: correct/answered and sum/n.
const EXP2: Array<[key: string, name: string, interp: string, nat: string]> = [
  ['elevenlabs', 'ElevenLabs eleven_v3', '62.8%', '3.62'], // 506/806, 2913/805
  ['gemini_tts', 'Gemini 3.1 Flash TTS', '56.8%', '2.99'], // 457/804, 2404/804
  ['gemini_live', 'Gemini 3.1 Flash Live', '51.9%', '3.01'], // 418/805, 2424/804
  ['openai_tts', 'OpenAI gpt-4o-mini-tts', '53.8%', '3.18'], // 416/773, 2457/773
  ['openai_sts', 'OpenAI gpt-realtime-2', '55.2%', '3.22'], // 442/801, 2580/801
  ['hume', 'Hume Octave', '62.4%', '3.10'], // 511/819, 2541/819
  ['grok_tts', 'Grok TTS', '63.8%', '3.53'], // 357/560, 1979/560
  ['grok_sts', 'Grok Voice', '47.3%', '3.66'], // 264/558, 2041/558
  ['nova_sts', 'Amazon Nova 2 Sonic', '49.4%', '3.35'], // 269/545, 1826/545
  ['human', 'Human', '69.9%', '3.59'], // 564/807, 2900/807
];

test('page title and header are Prosody Bench, with no other branding', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page).toHaveTitle('Prosody Bench');
  await expect(page.getByTestId('site-name')).toHaveText('Prosody Bench');
  await expect(page.locator('body')).not.toContainText('Artificial Analysis');
});

test('Exp 2 columns show the numbers computed from the seeded survey data', async ({ page }) => {
  await page.goto('/leaderboard');
  for (const [key, name, interp, nat] of EXP2) {
    await expect(page.getByTestId(`lb-row-${key}`)).toContainText(name);
    await expect(page.getByTestId(`lb-${key}-exp2Interp`)).toHaveText(interp);
    await expect(page.getByTestId(`lb-${key}-exp2Nat`)).toHaveText(nat);
  }
  await expect(page.getByTestId('lb-elevenlabs_v4-exp2Interp')).toHaveText('—');
  await expect(page.getByTestId('lb-elevenlabs_v4-exp2Nat')).toHaveText('—');
});

test('Exp 1 columns show — for every model until Exp 1 results are seeded', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.locator('[data-testid^="lb-row-"]')).toHaveCount(11);
  for (const metric of ['exp1Focus', 'exp1Nat', 'exp1Human']) {
    await expect(page.locator(`[data-testid^="lb-"][data-testid$="-${metric}"]`)).toHaveText(Array(11).fill('—'));
  }
});

test('the column headers are exactly Model plus the five metrics', async ({ page }) => {
  await page.goto('/leaderboard');
  const header = page.getByTestId('lb').locator('> div').first();
  await expect(header.locator('> *')).toHaveText([
    'Model',
    /Exp 1 focus accuracy/,
    /Exp 1 naturalness/,
    /Exp 1 judged human/,
    /Exp 2 interpretation accuracy/,
    /Exp 2 naturalness/,
  ]);
});
