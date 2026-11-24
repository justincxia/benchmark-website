import { test, expect, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const activeArt = (page: Page) =>
  page.evaluate(() =>
    [1, 2, 3, 4, 5].findIndex(
      (i) => getComputedStyle(document.querySelector(`[data-testid=intro-art-${i}]`)!.parentElement!).opacity === '1'
    ) + 1
  );

test('the intro renders five steps and both ending links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid^="intro-step-"]')).toHaveCount(5);
  await expect(page.getByTestId('intro-step-1')).toContainText('The same words can mean different things.');
  await expect(page.getByTestId('intro-step-2')).toContainText('Molly mailed a melon.');
  await expect(page.getByTestId('intro-step-2')).toContainText('Who mailed a melon?');
  await expect(page.getByTestId('intro-step-3')).toContainText('Lisa saw the man with the telescope.');
  await expect(page.getByTestId('intro-step-3')).toContainText('A: Lisa used the telescope to see the man.');
  await expect(page.getByTestId('intro-step-3')).toContainText('B: Lisa saw a man who is in possession of a telescope.');
  await expect(page.getByTestId('intro-step-4')).toContainText('Can speech models?');
  await expect(page.getByTestId('intro-step-5')).toContainText('Experiment 1');
  await expect(page.getByTestId('intro-cta-leaderboard')).toHaveAttribute('href', '/leaderboard');
  await expect(page.getByTestId('intro-cta-leaderboard')).toHaveText('See the leaderboard');
  await expect(page.getByTestId('intro-cta-arena')).toHaveAttribute('href', '/arena');
  await expect(page.getByTestId('intro-cta-arena')).toHaveText('Try the arena');
  // The sub-nav is unchanged: no tab for the intro.
  await expect(page.locator('nav a')).toHaveText(['Leaderboard', 'Arena', 'Record']);
});

test('the backgrounds are aria-hidden text art, and they change as the steps scroll by, with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  for (let i = 1; i <= 5; i++) {
    const art = page.getByTestId(`intro-art-${i}`);
    await expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(await art.locator('svg, canvas, img').count()).toBe(0);
  }
  await expect.poll(() => page.getByTestId('intro-art-1').locator('pre').first().textContent()).toMatch(/molly/i);

  for (let step = 1; step <= 5; step++) {
    await page.getByTestId(`intro-step-${step}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`intro-step-${step}`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(() => activeArt(page)).toBe(step);
    await expect(page.getByTestId(`intro-step-${step}`).locator('> div')).toHaveCSS('opacity', '1');
  }
  // The art animates while its step is shown.
  const pre = page.getByTestId('intro-art-5').locator('pre').nth(1);
  const before = await pre.textContent();
  await expect.poll(async () => (await pre.textContent()) !== before, { timeout: 15_000 }).toBe(true);

  await page.getByTestId('intro-ending').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.getByTestId('intro-cta-arena')).toBeVisible();
  expect(errors).toEqual([]);
});

test('with reduced motion, the story is all visible and the art is static', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByTestId(`intro-step-${i}`).locator('> div')).toHaveCSS('opacity', '1');
  }
  await expect(page.getByTestId('intro-step-1').locator('> div')).toHaveCSS('transition-duration', '0s');
  const pre = page.getByTestId('intro-art-1').locator('pre').nth(2);
  await expect.poll(() => pre.textContent()).not.toBe('');
  const first = await pre.textContent();
  await page.waitForTimeout(1200);
  expect(await pre.textContent()).toBe(first);
  expect(errors).toEqual([]);
});

test('no horizontal scroll at 375px, and the footer is reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByTestId('footer-privacy').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('footer-privacy')).toBeInViewport();
});

test('the page makes no requests to other hosts (no trackers, fonts self-hosted)', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
  });
  for (const path of ['/', '/leaderboard', '/privacy']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});

test('the header name links to /', async ({ page }) => {
  await page.goto('/leaderboard?exp=2');
  await page.getByTestId('site-name').click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await expect(page.getByTestId('intro')).toBeVisible();
});

test('every page has a footer Privacy Policy link that reaches /privacy', async ({ page }) => {
  for (const path of ['/', '/leaderboard', '/leaderboard?exp=1', '/arena', '/record', '/account', '/privacy']) {
    await page.goto(path);
    const link = page.getByTestId('footer-privacy');
    await expect(link).toHaveText('Privacy policy');
    await expect(page.getByTestId('footer-text')).toHaveText('Made by Penn Phonetics Lab - Privacy policy');
    await expect(page.getByTestId('footer-text')).toHaveCSS('text-align', 'center');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.locator('h1')).toHaveText('Privacy Policy');
  }
  // The footer's only link is that one, and /privacy is not a sub-nav tab.
  await expect(page.locator('footer a')).toHaveCount(1);
  await expect(page.locator('nav a', { hasText: 'Privacy' })).toHaveCount(0);
  await expect(page.getByTestId('privacy-policy')).toContainText('Last updated: November 9, 2026');
  await expect(page.getByTestId('privacy-policy')).toContainText('[CONTACT NAME / EMAIL]');
});

// ---- Step 2 (Focus): its card pins to the top and the stress follows the scroll position.

/** Scrolls to a share (0–1) of the stretch where the Focus card is pinned under the header. */
const scrollFocusTo = (page: Page, p: number) =>
  page.evaluate((share) => {
    const section = document.querySelector<HTMLElement>('[data-testid=intro-step-2]')!;
    const card = document.querySelector<HTMLElement>('[data-testid=intro-card-2]')!;
    const tail = parseFloat(getComputedStyle(section).paddingBottom);
    const range = section.offsetHeight - tail - 16 - card.offsetHeight;
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 56 + share * range);
  }, p);

/** The word drawn at the brightest level in the focus art. */
const stressedWord = (page: Page) =>
  page.evaluate(() => {
    const bright = document.querySelectorAll('[data-testid=intro-art-2] pre')[2].textContent ?? '';
    const has = (ch: string) => bright.includes(ch);
    return has('Y') ? 'MOLLY' : has('I') || has('D') ? 'MAILED' : has('N') ? 'MELON' : has('A') ? 'A' : 'none';
  });

const focusArtText = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid=intro-art-2] pre')].map((p) => p.textContent).join('|'));

const cardTop = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-testid=intro-card-2]')!.getBoundingClientRect().top);

test('the Focus card has the exact copy', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId('intro-card-2');
  await expect(card.locator('> div').first()).toHaveText('Focus');
  await expect(card.locator('h2')).toHaveText('Molly mailed a melon.');
  await expect(card.locator('p')).toHaveText('The emphasized word tells the listener which question the sentence answers.');
  await expect(card.locator('ul > li')).toHaveText([
    'MOLLY mailed a melon. → “Who mailed a melon?”',
    'Molly MAILED a melon. → “What did Molly do with the melon?”',
    'Molly mailed A melon. → “How many melons did Molly mail?”',
    'Molly mailed a MELON. → “What did Molly mail?”',
  ]);
});

test('the Focus stress holds still without scrolling, and scrolling moves it MOLLY → MAILED → A → MELON and back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await scrollFocusTo(page, 0.03);
  await expect.poll(() => activeArt(page)).toBe(2);
  await expect.poll(() => stressedWord(page)).toBe('MOLLY');
  // No timer: nothing in the art changes while the page is left alone.
  const still = await focusArtText(page);
  await page.waitForTimeout(3500);
  expect(await focusArtText(page)).toBe(still);
  expect(await stressedWord(page)).toBe('MOLLY');

  for (const [share, word] of [[0.34, 'MAILED'], [0.66, 'A'], [0.97, 'MELON'], [0.66, 'A'], [0.34, 'MAILED'], [0.03, 'MOLLY']] as const) {
    await scrollFocusTo(page, share);
    await expect.poll(() => stressedWord(page)).toBe(word);
    // The card stays pinned just under the header the whole way.
    expect(Math.round(await cardTop(page))).toBe(56 + 16);
    await expect(page.getByTestId('intro-card-2')).toHaveCSS('opacity', '1');
  }

  // Part-way between two words the frame is different again, and it too holds still.
  await scrollFocusTo(page, 0.17);
  await expect.poll(() => focusArtText(page)).not.toBe(still);
  const between = await focusArtText(page);
  await page.waitForTimeout(1000);
  expect(await focusArtText(page)).toBe(between);
  expect(errors).toEqual([]);
});

test('with reduced motion, the Focus stress still follows the scroll, one whole word at a time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const frames = new Set<string>();
  for (const share of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    await scrollFocusTo(page, share);
    await page.waitForTimeout(150);
    expect(['MOLLY', 'MAILED', 'A', 'MELON']).toContain(await stressedWord(page));
    frames.add(await focusArtText(page));
  }
  // Four resting frames, no in-between ones.
  expect(frames.size).toBe(4);
});

for (const [width, height] of [[1280, 800], [375, 812], [375, 667]]) {
  test(`at ${width}×${height}, the focus art's four words sit below the pinned Focus card, not behind it`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await scrollFocusTo(page, 0.34);
    await expect.poll(() => activeArt(page)).toBe(2);
    await expect.poll(() => stressedWord(page)).toBe('MAILED');

    const result = await page.evaluate(() => {
      const card = document.querySelector('[data-testid=intro-card-2]')!.getBoundingClientRect();
      const art = document.querySelector('[data-testid=intro-art-2]')!;
      const box = art.getBoundingClientRect();
      const pres = [...art.querySelectorAll('pre')];
      const line = parseFloat(pres[0].style.lineHeight);
      const rows: { y0: number; y1: number; letters: string }[] = [];
      const lines = pres.map((p) => (p.textContent ?? '').split('\n'));
      for (let r = 0; r < lines[0].length; r++) {
        const letters = lines.map((l) => (l[r] ?? '').replace(/[^MOLYAIEDN]/g, '')).join('');
        if (letters) rows.push({ y0: box.top + r * line, y1: box.top + (r + 1) * line, letters });
      }
      return { card: { top: card.top, bottom: card.bottom }, rows, viewport: window.innerHeight };
    });

    expect(Math.round(result.card.top)).toBe(56 + 16);
    expect(result.rows.length).toBeGreaterThan(0);
    // Every letter row is below the card and on screen, and all four words' letters are there.
    for (const r of result.rows) {
      expect(r.y0).toBeGreaterThanOrEqual(result.card.bottom);
      expect(r.y1).toBeLessThanOrEqual(result.viewport);
    }
    const letters = new Set(result.rows.map((r) => r.letters).join(''));
    for (const ch of 'MOLYAIEDN') expect(letters.has(ch)).toBe(true);
  });
}
