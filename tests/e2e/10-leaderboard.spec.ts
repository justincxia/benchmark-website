import { test, expect } from '@playwright/test';
import { rowOrder } from './helpers';

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

test('with no ?exp, the leaderboard opens on the experiment that has results (Exp 2)', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('exp-switch-2')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('exp-switch-1')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('h2').first()).toHaveText('Experiment 2: Ambiguity');
});

test('Experiment 2 shows the numbers computed from the seeded survey data', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  const rows = await rowOrder(page, 'lb');
  expect(rows).toHaveLength(10);
  expect(rows).not.toContain('elevenlabs_v4');
  for (const [key, name, interp, nat] of EXP2) {
    await expect(page.getByTestId(`lb-row-${key}`)).toContainText(name);
    await expect(page.getByTestId(`lb-${key}-exp2Interp`)).toHaveText(interp);
    await expect(page.getByTestId(`lb-${key}-exp2Nat`)).toHaveText(nat);
  }
  await expect(page.locator('[data-testid$="-exp1Focus"]')).toHaveCount(0);
  await expect(page.getByTestId('no-data')).toHaveCount(0);
});

test('Experiment 1 shows — for every model until its results are seeded, and says so', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  const rows = await rowOrder(page, 'lb');
  expect(rows).toHaveLength(10);
  expect(rows).not.toContain('human');
  for (const metric of ['exp1Focus', 'exp1Nat', 'exp1Human']) {
    await expect(page.locator(`[data-testid^="lb-"][data-testid$="-${metric}"]`)).toHaveText(Array(10).fill('—'));
  }
  await expect(page.locator('[data-testid$="-exp2Interp"]')).toHaveCount(0);
  await expect(page.getByTestId('no-data')).toBeVisible();
});

test('the column headers are Model plus the picked experiment\'s metrics', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  const header = page.getByTestId('lb').locator('> div').first();
  await expect(header.locator('> *')).toHaveText(['Model', /Focus accuracy/, /Naturalness/, /Judged human/]);
  await page.goto('/leaderboard?exp=2');
  await expect(header.locator('> *')).toHaveText(['Model', /Interpretation accuracy/, /Naturalness/]);
});

test('the switch changes experiment without leaving the leaderboard', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await page.getByTestId('exp-switch-1').click();
  await expect(page).toHaveURL(/\/leaderboard\?exp=1$/);
  await expect(page.locator('h2').first()).toHaveText('Experiment 1: Focus');
  await expect(page.locator('[data-testid^="lb-"][data-testid$="-exp1Focus"]')).toHaveCount(10);
  await page.getByTestId('exp-switch-2').click();
  await expect(page).toHaveURL(/\/leaderboard\?exp=2$/);
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText('69.9%');
});

test('descriptions are hidden until their (i) is clicked, and hide again on a second click, a click elsewhere or Escape', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await expect(page.locator('body')).not.toContainText('A human perception survey on syntactic ambiguity');
  await expect(page.locator('body')).not.toContainText('Click a column header to sort');
  await expect(page.getByTestId('exp2-sentences')).toHaveCount(0);

  const info = page.getByTestId('info-experiment');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await info.click();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('info-panel-experiment')).toContainText('A human perception survey on syntactic ambiguity');
  await expect(page.getByTestId('exp2-sentences')).toContainText('The servant of the actress who was crying left.');
  await info.click();
  await expect(page.getByTestId('info-panel-experiment')).toHaveCount(0);
  await info.click();
  await expect(page.getByTestId('info-panel-experiment')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info-panel-experiment')).toHaveCount(0);
  await info.click();
  await page.locator('h1').click();
  await expect(page.getByTestId('info-panel-experiment')).toHaveCount(0);

  for (const id of ['leaderboard', 'charts', 'plots', 'examples']) {
    await expect(page.getByTestId(`info-panel-${id}`)).toHaveCount(0);
    await page.getByTestId(`info-${id}`).click();
    await expect(page.getByTestId(`info-panel-${id}`)).toBeVisible();
  }

  await page.goto('/leaderboard?exp=1');
  await page.getByTestId('info-experiment').click();
  await expect(page.getByTestId('info-panel-experiment')).toContainText('A human perception survey on prosodic focus');
});

test('charts: one per column with data, bars ordered highest first; none without data', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  const bars = (metric: string) =>
    page.locator(`[data-testid^="chart-${metric}-"]`).evaluateAll((els, m) =>
      els.map((e) => (e.getAttribute('data-testid') ?? '').slice(`chart-${m}-`.length)), metric);
  expect(await bars('exp2Interp')).toEqual([
    'human', 'grok_tts', 'elevenlabs', 'hume', 'gemini_tts', 'openai_sts', 'openai_tts', 'gemini_live', 'nova_sts', 'grok_sts',
  ]);
  expect((await bars('exp2Nat'))[0]).toBe('grok_sts');
  await expect(page.getByTestId('chart-exp2Interp-human')).toContainText('69.9%');

  // Experiment 2 also plots naturalness against accuracy, a point per model.
  await expect(page.locator('[data-testid^="scatter-point-"]')).toHaveCount(10);
  await expect(page.getByTestId('scatter')).toContainText('Naturalness against interpretation accuracy');
  await expect(page.getByTestId('scatter-point-human')).toContainText('naturalness 3.59, interpretation accuracy 69.9%');
  const boxes = await page.locator('[data-testid^="scatter-point-"] text').evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      expect(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3], `labels ${i} and ${j} overlap`).toBe(false);
    }

  await page.goto('/leaderboard?exp=1');
  await expect(page.getByTestId('scatter')).toHaveCount(0);
  await expect(page.locator('[data-testid^="chart-"]')).toHaveCount(0);
  await expect(page.getByTestId('info-charts')).toHaveCount(0);
});

test('acoustic plots: the picked model and sentence choose the image, and every image loads', async ({ page }) => {
  await page.goto('/leaderboard?exp=1');
  const img = page.getByTestId('plot-image');
  await expect(img).toHaveAttribute('src', '/plots/focus_elevenlabs.png');
  await page.getByTestId('plot-pick-hume').click();
  await expect(img).toHaveAttribute('src', '/plots/focus_hume.png');
  await expect(page.getByTestId('plot-pick-hume')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(2550);

  await page.goto('/leaderboard?exp=2');
  await expect(img).toHaveAttribute('src', '/plots/ambiguity_gemini_tts_servant.png');
  await page.getByTestId('plot-pick-human').click();
  await page.getByTestId('plot-pick-old_men').click();
  await expect(img).toHaveAttribute('src', '/plots/ambiguity_human_old_men.png');
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1500);
});

test('an (i) description is a popup over the page: it moves nothing and sits on top of the table', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  const top = () => page.getByTestId('lb').evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  await page.getByTestId('info-experiment').click();
  const panel = page.getByTestId('info-panel-experiment');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('position', 'absolute');
  await expect(panel).toHaveCSS('opacity', '1'); // the entry animation has finished
  expect(await top()).toBe(before);
  // The popup covers part of the table, and is the element on top there.
  const onTop = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  expect(onTop).toBe(true);
  const box = await panel.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(before);
});

test('at phone width an (i) popup stays inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/leaderboard?exp=2');
  for (const id of ['leaderboard', 'experiment', 'charts', 'plots', 'examples']) {
    await page.getByTestId(`info-${id}`).click();
    const box = await page.getByTestId(`info-panel-${id}`).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`info-panel-${id}`)).toHaveCount(0);
  }
});
