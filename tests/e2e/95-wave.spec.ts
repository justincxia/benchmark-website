import { test, expect } from '@playwright/test';

const posX = (page: import('@playwright/test').Page) =>
  page.getByTestId('wave-bg').evaluate((el) => parseFloat(getComputedStyle(el).backgroundPositionX));

test('the leaderboard has a sound wave at mid-height that moves right on scroll down and back on scroll up', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/leaderboard?exp=2');
  const wave = page.getByTestId('wave-bg');
  await expect(wave).toHaveAttribute('aria-hidden', 'true');

  // A band across the whole window, centred vertically, that stays put while the page scrolls.
  const box = async () => wave.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const [left, top, width, height] = await box();
  expect(left).toBe(0);
  expect(width).toBe(1280);
  expect(Math.abs(top + height / 2 - 400)).toBeLessThanOrEqual(1);

  expect(await posX(page)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => posX(page)).toBe(300);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await expect.poll(() => posX(page)).toBe(600);
  expect(await box()).toEqual([left, top, width, height]);
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect.poll(() => posX(page)).toBe(120);
});

test('the wave is behind the content: cards cover it and it never takes a click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/leaderboard?exp=2');
  // The middle of the window is inside the results table; the table, not the wave, is on top there.
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(640, 400);
    return { inTable: !!el?.closest('[data-testid="lb"]'), isWave: el?.getAttribute('data-testid') === 'wave-bg' };
  });
  expect(hit).toEqual({ inTable: true, isWave: false });
  await expect(page.getByTestId('wave-bg').locator('..')).toHaveCSS('pointer-events', 'none');
  // Controls over the wave still work.
  await page.getByTestId('sort-exp2Nat').click();
  await expect(page.getByTestId('sort-exp2Nat')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('info-experiment').click();
  await expect(page.getByTestId('info-panel-experiment')).toBeVisible();
});

test('only the leaderboard has the wave, and it holds still under reduced motion', async ({ page }) => {
  for (const path of ['/', '/arena', '/record', '/privacy']) {
    await page.goto(path);
    await expect(page.getByTestId('wave-bg')).toHaveCount(0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/leaderboard?exp=2');
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  expect(await posX(page)).toBe(0);
});
