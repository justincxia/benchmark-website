import { test, expect, type Page } from '@playwright/test';
import { countRows, latestResponse, openArena, playThrough, servedClip } from './helpers';
import { MODELS } from '../../lib/models.ts';

const LEAKS = ['Correct', 'Incorrect', 'Wrong', 'It was', 'score', 'Score', 'accuracy'];

async function assertNothingRevealed(page: Page) {
  const body = page.locator('body');
  for (const leak of LEAKS) await expect(body).not.toContainText(leak);
  // No model name, ever. ("Human" is excluded: it is an answer option in Experiment 1.)
  for (const m of MODELS.filter((x) => x.key !== 'human')) await expect(body).not.toContainText(m.name);
}

async function answerExp1(page: Page) {
  await playThrough(page);
  await page.getByTestId('arena-nat-4').click();
  await page.getByTestId('arena-hai-AI').click();
  await page.getByTestId('arena-q-4').click(); // "What happened?"
  await page.getByTestId('arena-submit').click();
}

async function answerExp2(page: Page) {
  await playThrough(page);
  await page.getByTestId('arena-interp-B').click();
  await page.getByTestId('arena-nat-2').click();
  await page.getByTestId('arena-submit').click();
}

test('Experiment 1: a submission adds exactly one responses row, with server-derived truth', async ({ page }) => {
  const before = { r: countRows('responses'), e1: countRows('exp1_trials'), e2: countRows('exp2_trials') };
  await openArena(page, 1);
  const file = await servedClip(page);
  await expect(page.getByTestId('arena-progress')).toHaveText('Clip 1 of 50');
  // The three survey questions, in order.
  await expect(page.locator('.text-\\[13\\.5px\\].font-semibold.mb-3')).toHaveText([
    'Rate the naturalness by pressing one of the following keys:',
    'Was this voice produced by a human speaker or an AI system?',
    'What question does this sentence answer?',
  ]);

  await answerExp1(page);
  await expect(page.getByTestId('arena-recorded')).toHaveText('Response recorded');
  await expect(page.getByTestId('arena-next')).toBeVisible();
  expect(countRows('responses')).toBe(before.r + 1);
  expect(countRows('exp1_trials')).toBe(before.e1);
  expect(countRows('exp2_trials')).toBe(before.e2);

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
});

test('Experiment 2: the sentence screen comes first; a submission adds one row and reveals nothing', async ({ page }) => {
  const before = { r: countRows('responses'), e1: countRows('exp1_trials'), e2: countRows('exp2_trials') };
  await page.goto('/arena');
  await page.getByTestId('arena-mode-2').click();
  const intro = page.getByTestId('arena-intro');
  await expect(intro).toContainText('Sentence:');
  await expect(intro).toContainText('Interpretation A:');
  await expect(intro).toContainText('Interpretation B:');
  await page.getByTestId('arena-intro-continue').click();

  const file = await servedClip(page);
  await expect(page.getByTestId('arena-progress')).toHaveText(/Clip 1 of \d+/);
  await expect(page.locator('body')).not.toContainText('Was this voice produced by a human');
  await expect(page.locator('.text-\\[13\\.5px\\].font-semibold.mb-3')).toHaveText([
    'Which interpretation did the speaker intend?',
    'Rate the naturalness by pressing one of the following keys:',
  ]);
  await expect(page.getByTestId('arena-interp-A')).toHaveText(/^A: /);

  await answerExp2(page);
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

test('submit stays disabled until the clip has played through', async ({ page }) => {
  await openArena(page, 1);
  await servedClip(page);
  await page.getByTestId('arena-nat-4').click();
  await page.getByTestId('arena-hai-Human').click();
  await page.getByTestId('arena-q-0').click();
  await expect(page.getByTestId('arena-submit')).toHaveText('Play the clip through once to submit');
  await expect(page.getByTestId('arena-submit')).toHaveAttribute('aria-disabled', 'true');
  const before = countRows('responses');
  await page.getByTestId('arena-submit').click({ force: true });
  await page.waitForTimeout(500);
  expect(countRows('responses')).toBe(before);
  await expect(page.getByTestId('arena-recorded')).toHaveCount(0);
});

test('a reload resumes the block at the same clip, and Next advances it', async ({ page }) => {
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
  const next = latestResponse();
  expect(next.participant).toBe(answered.participant);
  expect(next.session).toBe(answered.session);
  expect(next.round).toBe(Number(answered.round) + 1);
});

test('the leaderboard does not move after arena traffic', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('lb-human-exp2Interp')).toHaveText('69.9%');
  await expect(page.getByTestId('lb-human-exp2Nat')).toHaveText('3.59');
  await expect(page.getByTestId('lb-hume-exp1Focus')).toHaveText('—');
});
