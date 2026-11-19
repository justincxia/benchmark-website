import { test, expect, type Page } from '@playwright/test';
import { countRows, latestResponse, openArena, playThrough, servedClip } from './helpers';
import { MODELS } from '../../lib/models.ts';

const LEAKS = ['Correct', 'Incorrect', 'Wrong', 'It was', 'score', 'Score', 'accuracy'];
const NAT = 'Rate the naturalness by pressing one of the following keys:';
const HAI = 'Was this voice produced by a human speaker or an AI system?';
const QUESTION = 'What question does this sentence answer?';
const INTERP = 'Which interpretation did the speaker intend?';

async function assertNothingRevealed(page: Page) {
  const body = page.locator('body');
  for (const leak of LEAKS) await expect(body).not.toContainText(leak);
  // No model name, ever. ("Human" is excluded: it is an answer option in Experiment 1.)
  for (const m of MODELS.filter((x) => x.key !== 'human')) await expect(body).not.toContainText(m.name);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const next = (page: Page) => page.getByTestId('arena-next-question');
const step = (page: Page) => page.getByTestId('arena-step');
const prompt = (page: Page) => page.getByTestId('arena-prompt');

/** Plays the clip and answers Experiment 1's three questions: 4, AI, "What happened?". */
async function answerExp1(page: Page) {
  await playThrough(page);
  await page.getByTestId('arena-nat-4').click();
  await next(page).click();
  await page.getByTestId('arena-hai-AI').click();
  await next(page).click();
  await page.getByTestId('arena-q-4').click(); // "What happened?"
  await page.getByTestId('arena-submit').click();
}

/** The loudness bars' levels: '' for a slice that has not been played. */
const barLevels = (page: Page) =>
  page.getByTestId('arena-bar').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.level ?? ''));

test('the start screen has the instructions, the mode choice and Play now; Play now hides them', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.locator('h1')).toHaveText('Arena');
  await expect(page.getByTestId('arena-instructions')).toContainText('Instructions');
  await expect(page.getByTestId('arena-mode-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('arena-mode-2')).toBeVisible();
  await expect(page.getByTestId('arena-play-now')).toHaveText('Play now');
  // Nothing of the game yet.
  await expect(page.getByTestId('arena-audio')).toHaveCount(0);
  await expect(page.getByTestId('arena-question')).toHaveCount(0);

  await page.getByTestId('arena-play-now').click();
  await expect(page.getByTestId('arena-game')).toBeVisible();
  await expect(page.getByTestId('arena-instructions')).toHaveCount(0);
  await expect(page.getByTestId('arena-mode-1')).toHaveCount(0);
  await expect(page.getByTestId('arena-play-now')).toHaveCount(0);
  // The play screen: the header line, the clip and one question. No other panels.
  await expect(page.getByTestId('arena-progress')).toHaveText('Experiment 1 · Clip 1 of 50');
  await expect(page.getByTestId('arena-game').locator('> *')).toHaveCount(3);
  await expect(page.getByTestId('arena-clip')).toBeVisible();
  await expect(prompt(page)).toHaveCount(1);

  // The instructions stay hidden for the rest of the visit, also across a reload.
  await page.reload();
  await expect(page.getByTestId('arena-game')).toBeVisible();
  await expect(page.getByTestId('arena-instructions')).toHaveCount(0);
});

test('questions come one at a time: Next needs a pick, Back keeps the answer and lets it change, Submit is last', async ({ page }) => {
  const before = { r: countRows('responses'), e1: countRows('exp1_trials'), e2: countRows('exp2_trials') };
  await openArena(page, 1);
  const file = await servedClip(page);
  await playThrough(page);

  // Question 1 of 3: naturalness. Only it is on screen.
  await expect(step(page)).toHaveText('1 of 3');
  await expect(prompt(page)).toHaveText(NAT);
  await expect(page.getByTestId('arena-question').getByRole('radio')).toHaveText([
    '11 - Completely unnatural',
    '22 - Mostly unnatural',
    '33 - In between unnatural and natural',
    '44 - Mostly natural',
    '55 - Completely natural',
  ]);
  await expect(page.locator('body')).not.toContainText(HAI);
  await expect(page.locator('body')).not.toContainText(QUESTION);
  await expect(page.getByTestId('arena-submit')).toHaveCount(0);
  await expect(page.getByTestId('arena-back')).toHaveCount(0);
  await expect(next(page)).toBeDisabled();
  await page.getByTestId('arena-nat-3').click();
  await expect(page.getByTestId('arena-nat-3')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('arena-nat-2').click(); // a picker: one row at a time
  await expect(page.getByTestId('arena-nat-3')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('arena-nat-2')).toHaveAttribute('aria-checked', 'true');
  await next(page).click();

  // Question 2 of 3: the previous one is hidden.
  await expect(step(page)).toHaveText('2 of 3');
  await expect(prompt(page)).toHaveText(HAI);
  await expect(page.locator('body')).not.toContainText(NAT);
  await expect(page.getByTestId('arena-question').getByRole('radio')).toHaveText(['HHuman', 'AAI']);
  await expect(next(page)).toBeDisabled();
  await page.getByTestId('arena-hai-Human').click();
  await next(page).click();

  // Question 3 of 3: Submit instead of Next.
  await expect(step(page)).toHaveText('3 of 3');
  await expect(prompt(page)).toHaveText(QUESTION);
  await expect(page.getByTestId('arena-question').getByRole('radio')).toHaveText([
    '1Who mailed a melon?',
    '2What did Molly do with the melon?',
    '3How many melons did Molly mail?',
    '4What did Molly mail?',
    '5What happened?',
  ]);
  await expect(next(page)).toHaveCount(0);
  await expect(page.getByTestId('arena-submit')).toHaveText('Submit');
  await expect(page.getByTestId('arena-submit')).toBeDisabled();
  await expect(page.getByTestId('arena-hint')).toHaveText('Pick an answer to submit.');
  await page.getByTestId('arena-q-4').click();
  await expect(page.getByTestId('arena-submit')).toBeEnabled();
  await expect(page.getByTestId('arena-hint')).toHaveText('');

  // Back twice: the earlier answers are still selected, and can be changed.
  await page.getByTestId('arena-back').click();
  await expect(step(page)).toHaveText('2 of 3');
  await expect(page.getByTestId('arena-hai-Human')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('arena-hai-AI').click();
  await page.getByTestId('arena-back').click();
  await expect(step(page)).toHaveText('1 of 3');
  await expect(page.getByTestId('arena-nat-2')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('arena-nat-4').click();
  await next(page).click();
  await expect(page.getByTestId('arena-hai-AI')).toHaveAttribute('aria-checked', 'true');
  await next(page).click();
  await expect(page.getByTestId('arena-q-4')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('arena-submit').click();
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  await expect(page.getByTestId('arena-next')).toBeVisible();
  await expect(page.getByTestId('arena-question')).toHaveCount(0);
  expect(countRows('responses')).toBe(before.r + 1);
  expect(countRows('exp1_trials')).toBe(before.e1);
  expect(countRows('exp2_trials')).toBe(before.e2);

  // The row holds the changed answers, and the truth comes from the clip, not the page.
  const row = latestResponse();
  expect(row.clip).toBe(file);
  expect(row.experiment).toBe(1);
  const condition = /_focus_(broad|molly|mailed|a|melon)_\d+\.wav$/.exec(file)![1];
  expect(row.condition).toBe(condition);
  expect(row.take).toBe(Number(/_(\d+)\.wav$/.exec(file)![1]));
  expect(row.naturalness).toBe(4);
  expect(row.human_or_ai).toBe('AI');
  expect(row.question_answered).toBe('What happened?');
  expect(row.interpretation).toBe(null);
  expect(Number(row.listened_ms)).toBeGreaterThan(0);

  await assertNothingRevealed(page);

  // Next clip starts the next round at question 1.
  await page.getByTestId('arena-next').click();
  await expect(page.getByTestId('arena-progress')).toHaveText('Experiment 1 · Clip 2 of 50');
  await expect(step(page)).toHaveText('1 of 3');
  await expect(page.getByTestId('arena-question').locator('[aria-checked=true]')).toHaveCount(0);
});

test('Experiment 2: the sentence screen comes first; two questions; a submission adds one row and reveals nothing', async ({ page }) => {
  const before = { r: countRows('responses'), e1: countRows('exp1_trials'), e2: countRows('exp2_trials') };
  await page.goto('/arena');
  await page.getByTestId('arena-mode-2').click();
  await page.getByTestId('arena-play-now').click();
  const intro = page.getByTestId('arena-intro');
  await expect(intro).toContainText('Sentence:');
  await expect(intro).toContainText('Interpretation A:');
  await expect(intro).toContainText('Interpretation B:');
  await expect(page.getByTestId('arena-question')).toHaveCount(0);
  await page.getByTestId('arena-intro-continue').click();

  const file = await servedClip(page);
  await expect(page.getByTestId('arena-progress')).toHaveText(/^Experiment 2 · Clip 1 of \d+$/);
  await playThrough(page);

  await expect(step(page)).toHaveText('1 of 2');
  await expect(prompt(page)).toHaveText(INTERP);
  // The rows carry the readings themselves.
  await expect(page.getByTestId('arena-interp-A')).toHaveText(/^AA: .{20,}/);
  await expect(page.getByTestId('arena-interp-B')).toHaveText(/^BB: .{20,}/);
  await expect(next(page)).toBeDisabled();
  await page.getByTestId('arena-interp-B').click();
  await next(page).click();

  await expect(step(page)).toHaveText('2 of 2');
  await expect(prompt(page)).toHaveText(NAT);
  await expect(page.locator('body')).not.toContainText(HAI);
  await expect(page.getByTestId('arena-submit')).toBeDisabled();
  await page.getByTestId('arena-nat-2').click();
  await page.getByTestId('arena-submit').click();

  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  expect(countRows('responses')).toBe(before.r + 1);
  expect(countRows('exp1_trials')).toBe(before.e1);
  expect(countRows('exp2_trials')).toBe(before.e2);

  const row = latestResponse();
  expect(row.clip).toBe(file);
  expect(row.experiment).toBe(2);
  expect(row.interpretation).toBe('B');
  expect(row.naturalness).toBe(2);
  expect(row.human_or_ai).toBe(null);
  expect(row.intended_interpretation).toBe(row.variant === 'a' ? 'A' : 'B');

  await assertNothingRevealed(page);
});

test('Submit stays disabled until the clip has played through', async ({ page }) => {
  await openArena(page, 1);
  await servedClip(page);
  await page.getByTestId('arena-nat-4').click();
  await next(page).click();
  await page.getByTestId('arena-hai-Human').click();
  await next(page).click();
  await page.getByTestId('arena-q-0').click();
  await expect(page.getByTestId('arena-submit')).toBeDisabled();
  await expect(page.getByTestId('arena-hint')).toHaveText('Play the clip to submit.');
  const before = countRows('responses');
  await page.getByTestId('arena-submit').click({ force: true });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(countRows('responses')).toBe(before);
  await expect(page.getByTestId('arena-recorded')).toHaveCount(0);

  // Playing it through unlocks Submit, with the answers still in place.
  await playThrough(page);
  await expect(page.getByTestId('arena-q-0')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('arena-submit')).toBeEnabled();
  await page.getByTestId('arena-submit').click();
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  expect(countRows('responses')).toBe(before + 1);
});

test('the keyboard: a row\'s key picks it, Enter is Next and Submit, Space plays the clip', async ({ page }) => {
  await openArena(page, 1);
  await servedClip(page);
  const before = countRows('responses');
  await page.keyboard.press('Enter'); // nothing picked: stays
  await expect(step(page)).toHaveText('1 of 3');
  await page.keyboard.press('5');
  await expect(page.getByTestId('arena-nat-5')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('2 of 3');
  await page.keyboard.press('h');
  await expect(page.getByTestId('arena-hai-Human')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('3 of 3');
  await page.keyboard.press('2');
  await expect(page.getByTestId('arena-q-1')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('arena-clip')).toHaveAttribute('data-completed', 'true', { timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  expect(countRows('responses')).toBe(before + 1);
  const row = latestResponse();
  expect(row.naturalness).toBe(5);
  expect(row.human_or_ai).toBe('Human');
  expect(row.question_answered).toBe('What did Molly do with the melon?');
});

test('Enter still moves on right after clicking Play or a row', async ({ page }) => {
  await openArena(page, 1);
  await playThrough(page); // leaves the focus on the play button
  await page.getByTestId('arena-nat-3').click();
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('2 of 3');
  await page.getByTestId('arena-hai-AI').click();
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('3 of 3');
});

test('a reload resumes the block at the same clip, and Next clip advances it', async ({ page }) => {
  await openArena(page, 1);
  const first = await servedClip(page);
  await page.reload();
  expect(await servedClip(page)).toBe(first);

  await answerExp1(page);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  const answered = latestResponse();
  await page.getByTestId('arena-next').click();
  const second = await servedClip(page);
  expect(second).not.toBe(first);
  await page.reload();
  expect(await servedClip(page)).toBe(second);

  await answerExp1(page);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  const nextRow = latestResponse();
  expect(nextRow.participant).toBe(answered.participant);
  expect(nextRow.session).toBe(answered.session);
  expect(nextRow.round).toBe(Number(answered.round) + 1);
});

test('a reload after submitting shows the recorded state, not a fresh form, and adds no row', async ({ page }) => {
  await openArena(page, 1);
  const file = await servedClip(page);
  const before = countRows('responses');
  await answerExp1(page);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  expect(countRows('responses')).toBe(before + 1);

  await page.reload();
  expect(await servedClip(page)).toBe(file);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  await expect(page.getByTestId('arena-next')).toBeVisible();
  await expect(page.getByTestId('arena-question')).toHaveCount(0);
  await expect(page.getByTestId('arena-submit')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(countRows('responses')).toBe(before + 1);
  await assertNothingRevealed(page);

  // Next clip still moves on to a fresh round.
  await page.getByTestId('arena-next').click();
  expect(await servedClip(page)).not.toBe(file);
  await expect(step(page)).toHaveText('1 of 3');
});

test('Instructions returns to the start screen and keeps the progress', async ({ page }) => {
  await openArena(page, 1);
  await answerExp1(page);
  await page.getByTestId('arena-next').click();
  await expect(page.getByTestId('arena-progress')).toHaveText('Experiment 1 · Clip 2 of 50');
  const file = await servedClip(page);

  await page.getByTestId('arena-show-instructions').click();
  await expect(page.getByTestId('arena-instructions')).toBeVisible();
  await expect(page.getByTestId('arena-game')).toHaveCount(0);
  await expect(page.getByTestId('arena-mode-1')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('arena-play-now').click();
  await expect(page.getByTestId('arena-progress')).toHaveText('Experiment 1 · Clip 2 of 50');
  expect(await servedClip(page)).toBe(file);
});

for (const [width, height] of [[1280, 800], [375, 667]]) {
  test(`at ${width}×${height}, the play screen fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });

    /** The header line, the clip and the question card (or what replaces it) are all on screen. */
    const fits = async (last: string) => {
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      for (const id of ['arena-progress', 'arena-show-instructions', 'arena-clip', last]) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.y, id).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, id).toBeLessThanOrEqual(height);
        expect(box.x + box.width, id).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    };

    await openArena(page, 1);
    await servedClip(page);
    await fits('arena-question');
    await page.getByTestId('arena-nat-3').click();
    await next(page).click();
    await fits('arena-question');
    await page.getByTestId('arena-hai-AI').click();
    await next(page).click();
    // The last question, with its hint and both buttons.
    await expect(page.getByTestId('arena-hint')).toHaveText('Pick an answer to submit.');
    await fits('arena-question');
    await fits('arena-submit');
    await page.getByTestId('arena-q-1').click();
    await fits('arena-back');
    await playThrough(page);
    await page.getByTestId('arena-submit').click();
    await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
    await fits('arena-next');

    // Experiment 2, whose rows carry the readings.
    await page.getByTestId('arena-show-instructions').click();
    await page.getByTestId('arena-mode-2').click();
    await page.getByTestId('arena-play-now').click();
    await page.getByTestId('arena-intro-continue').click();
    await servedClip(page);
    await fits('arena-question');
    await page.getByTestId('arena-interp-A').click();
    await next(page).click();
    await fits('arena-question');
  });
}

test('the clip graphic shows the real loudness, only for the part that has been played', async ({ page }) => {
  const errors = collectErrors(page);
  await openArena(page, 1);
  await servedClip(page);
  await expect(page.getByTestId('arena-meter')).toHaveAttribute('data-mode', 'bars');
  // Before playing, nothing about the clip is drawn.
  let levels = await barLevels(page);
  expect(levels).toHaveLength(48);
  expect(levels.every((l) => l === '')).toBe(true);

  // Play, and pause part-way (from inside the page, on the audio clock).
  await page.evaluate(() => {
    const a = document.querySelector<HTMLAudioElement>('[data-testid=arena-audio]')!;
    requestAnimationFrame(function check() {
      if (a.currentTime >= 0.2) a.pause();
      else requestAnimationFrame(check);
    });
  });
  await page.getByTestId('arena-play').click();
  await expect
    .poll(
      () => page.getByTestId('arena-audio').evaluate((a) => (a as HTMLAudioElement).paused && (a as HTMLAudioElement).currentTime >= 0.2),
      { timeout: 10_000 }
    )
    .toBe(true);
  await expect(page.getByTestId('arena-play')).toHaveAttribute('aria-label', 'Play');
  const at = await page.evaluate(() => {
    const a = document.querySelector<HTMLAudioElement>('[data-testid=arena-audio]')!;
    return { time: a.currentTime, duration: a.duration, ended: a.ended };
  });
  expect(at.ended).toBe(false);
  expect(at.time).toBeGreaterThanOrEqual(0.2);
  levels = await barLevels(page);
  const frontier = Math.floor((at.time / at.duration) * 48);
  // Drawn up to the playhead, nothing ahead of it.
  expect(levels.slice(0, Math.max(1, frontier - 1)).every((l) => l !== '')).toBe(true);
  expect(levels.slice(frontier + 1).every((l) => l === '')).toBe(true);
  expect(levels.slice(frontier + 1).length).toBeGreaterThan(10);

  // Resume to the end: the whole timeline is drawn, and the loud second half of the fixture
  // tone stands taller than its quiet first half.
  await page.getByTestId('arena-play').click();
  await expect(page.getByTestId('arena-clip')).toHaveAttribute('data-completed', 'true', { timeout: 15_000 });
  levels = await barLevels(page);
  expect(levels.every((l) => l !== '')).toBe(true);
  const mean = (xs: string[]) => xs.reduce((s, x) => s + Number(x), 0) / xs.length;
  const quiet = mean(levels.slice(4, 20));
  const loud = mean(levels.slice(28, 44));
  expect(loud).toBeGreaterThan(0.6);
  expect(quiet).toBeLessThan(loud / 2);
  const heights = await page.getByTestId('arena-bar').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(mean(heights.slice(28, 44).map(String))).toBeGreaterThan(2 * mean(heights.slice(4, 20).map(String)));

  // Restart clears it; so does the next clip.
  await page.getByTestId('arena-restart').click();
  expect((await barLevels(page)).every((l) => l === '')).toBe(true);
  await playThrough(page);
  expect((await barLevels(page)).every((l) => l !== '')).toBe(true);
  await page.getByTestId('arena-nat-3').click();
  await next(page).click();
  await page.getByTestId('arena-hai-AI').click();
  await next(page).click();
  await page.getByTestId('arena-q-0').click();
  await page.getByTestId('arena-submit').click();
  await page.getByTestId('arena-next').click();
  await servedClip(page);
  expect((await barLevels(page)).every((l) => l === '')).toBe(true);
  await playThrough(page);
  expect((await barLevels(page)).every((l) => l !== '')).toBe(true);
  expect(errors).toEqual([]);
});

test('with reduced motion the clip graphic is a plain progress bar, and the round still works', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openArena(page, 1);
  await servedClip(page);
  await expect(page.getByTestId('arena-meter')).toHaveAttribute('data-mode', 'progress');
  await expect(page.getByTestId('arena-bar')).toHaveCount(0);
  const before = countRows('responses');
  await answerExp1(page);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  expect(countRows('responses')).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('the leaderboard does not move after arena traffic', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText('69.9%');
  await expect(page.getByTestId('lb-human-exp2Nat')).toHaveText('3.59');
  await page.goto('/leaderboard?exp=1');
  await expect(page.getByTestId('lb-hume-exp1Focus')).toHaveText('—');
});
