import { test, expect } from '@playwright/test';

const themeBg = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=site-name]') as Element).backgroundColor);

test('the header has the site name linking to /, a user icon linking to /account, and a cog', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('site-name')).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeVisible();
  // The theme switch lives only inside the cog menu.
  await expect(page.getByTestId('theme-light')).toHaveCount(0);
  await page.getByTestId('header-account').click();
  await expect(page).toHaveURL(/\/account$/);
});

test('the cog opens a preferences menu whose Theme row switches theme and stays open', async ({ page }) => {
  await page.goto('/leaderboard');
  expect(await themeBg(page)).toBe('rgb(255, 255, 255)');

  await page.getByTestId('header-settings').click();
  const menu = page.getByTestId('preferences-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('li')).toHaveCount(1);
  await expect(page.getByTestId('pref-theme')).toContainText('Theme');
  await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('theme-dark').click();
  await expect(menu).toBeVisible(); // a setting, not a command: the menu stays open
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
  expect(await themeBg(page)).toBe('rgb(24, 24, 27)');

  await page.getByTestId('theme-light').click();
  await expect(menu).toBeVisible();
  expect(await themeBg(page)).toBe('rgb(255, 255, 255)');
});

test('there is no header bar: the name, account and cog are three separate soft-cornered pills fixed to the top corners', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/leaderboard');
  // The header itself paints nothing and lets clicks through; only the pills are drawn.
  const header = page.locator('header');
  await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(header).toHaveCSS('border-bottom-width', '0px');
  await expect(header).toHaveCSS('pointer-events', 'none');

  const pills = [page.getByTestId('site-name'), page.getByTestId('header-account'), page.getByTestId('header-settings')];
  for (const pill of pills) {
    await expect(pill).toHaveCSS('border-top-left-radius', '8px');
    await expect(pill).toHaveCSS('border-top-width', '1px');
    await expect(pill).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  const [name, account, cog] = await Promise.all(pills.map((p) => p.boundingBox()));
  expect(name!.x).toBe(16);
  expect(Math.round(cog!.x + cog!.width)).toBe(1280 - 16);
  expect(account!.x + account!.width).toBeLessThan(cog!.x); // separate pills, with a gap
  expect(account!.width).toBe(account!.height); // soft-cornered squares

  // They stay put while the page scrolls underneath.
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.evaluate(() => window.scrollTo(0, 400));
  expect((await page.getByTestId('site-name').boundingBox())!.y).toBe(name!.y);
});

test('the preferences menu closes on Escape and on an outside click', async ({ page }) => {
  await page.goto('/leaderboard');
  await page.getByTestId('header-settings').click();
  await expect(page.getByTestId('preferences-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preferences-menu')).toHaveCount(0);

  await page.getByTestId('header-settings').click();
  await expect(page.getByTestId('preferences-menu')).toBeVisible();
  await page.locator('h1').click();
  await expect(page.getByTestId('preferences-menu')).toHaveCount(0);
});
