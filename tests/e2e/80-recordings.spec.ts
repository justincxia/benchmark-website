import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { countRows, recordingById, recordingObjectExists, recordingsOf, signIn, userIdBySub } from './helpers';

async function recordAndSave(page: Page, promptId: string) {
  await page.getByTestId(`rec-start-${promptId}`).click();
  await expect(page.getByTestId(`rec-status-${promptId}`)).toHaveText('Recording…');
  await page.waitForTimeout(800);
  await page.getByTestId(`rec-stop-${promptId}`).click();
  await expect(page.getByTestId(`rec-audio-${promptId}`)).toBeVisible();
  await page.getByTestId(`rec-save-${promptId}`).click();
  await expect(page.getByTestId(`rec-status-${promptId}`)).toHaveText('Saved');
}

test('signed in, /record lists the 5 Exp 1 and 10 Exp 2 prompts with their cues', async ({ page }) => {
  await signIn(page, 'lister');
  await page.goto('/record');
  await expect(page.locator('[data-testid^="prompt-exp1-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="prompt-exp2-"]')).toHaveCount(10);
  await expect(page.getByTestId('prompt-exp1-broad')).toContainText('Answering: What happened?');
  await expect(page.getByTestId('prompt-exp1-a')).toContainText('How many melons did Molly mail?');
  await expect(page.getByTestId('prompt-exp2-lisa_telescope-b')).toContainText(
    'Interpretation B: Lisa saw a man who is in possession of a telescope.'
  );
});

test('record, re-record, save; it appears on /account, plays for its owner only, and deletes', async ({ page, browser }) => {
  test.setTimeout(90_000); // several first-compiled routes under the dev server
  const survey = { e1: await countRows('exp1_trials'), e2: await countRows('exp2_trials'), r: await countRows('responses') };
  await signIn(page, 'carol', 'Carol');
  await page.goto('/record');

  // Record once, re-record, then save: exactly one recording is stored.
  const id = 'exp1-melon';
  await page.getByTestId(`rec-start-${id}`).click();
  await page.waitForTimeout(500);
  await page.getByTestId(`rec-stop-${id}`).click();
  await expect(page.getByTestId(`rec-audio-${id}`)).toBeVisible();
  await page.getByTestId(`rec-redo-${id}`).click();
  await expect(page.getByTestId(`rec-status-${id}`)).toHaveText('Recording…');
  await page.waitForTimeout(800);
  await page.getByTestId(`rec-stop-${id}`).click();
  await page.getByTestId(`rec-save-${id}`).click();
  await expect(page.getByTestId(`rec-status-${id}`)).toHaveText('Saved');
  await recordAndSave(page, 'exp2-mirror_hallway-a');

  const carol = await userIdBySub('test:carol');
  const carolRecs = await recordingsOf(carol);
  expect(carolRecs).toHaveLength(2);
  const rec = carolRecs.find((r) => r.prompt_id === id)!;
  expect(rec.mime).toMatch(/^audio\//);
  // The audio is an object in the private Storage bucket, keyed <userId>/<uuid>.<ext>.
  expect(rec.path.startsWith(`${carol}/`)).toBe(true);
  expect(await recordingObjectExists(rec.path)).toBe(true);
  expect(path.basename(rec.path)).toMatch(/^[0-9a-f-]{36}\.\w+$/);

  // The list: newest first, with experiment, sentence, condition and a player.
  await page.goto('/account');
  const list = page.getByTestId('recordings-list');
  await expect(list.locator('> div')).toHaveCount(2);
  await expect(list.locator('> div').first()).toContainText('Experiment 2');
  await expect(list.locator('> div').first()).toContainText('David cleaned the mirror in the hallway.');
  await expect(list.locator('> div').nth(1)).toContainText('Experiment 1');
  await expect(list.locator('> div').nth(1)).toContainText('Focus: melon — What did Molly mail?');
  await expect(page.getByTestId(`recording-${rec.id}`).locator('audio')).toHaveAttribute('src', `/api/recordings/${rec.id}/audio`);

  // Playback route: the owner gets the bytes; another user and a signed-out visitor get 404.
  const own = await page.request.get(`/api/recordings/${rec.id}/audio`);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toBe(rec.mime);
  expect(own.headers()['accept-ranges']).toBe('bytes');
  // Streamed from Storage with Range passed through (Safari needs it to play media).
  const part = await page.request.get(`/api/recordings/${rec.id}/audio`, { headers: { Range: 'bytes=0-9' } });
  expect(part.status()).toBe(206);
  expect(part.headers()['content-range']).toMatch(/^bytes 0-9\/\d+$/);
  expect((await part.body()).length).toBe(10);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  expect((await otherPage.request.get(`http://localhost:3100/api/recordings/${rec.id}/audio`)).status()).toBe(404);
  await signIn(otherPage, 'mallory');
  expect((await otherPage.request.get(`/api/recordings/${rec.id}/audio`)).status()).toBe(404);
  expect((await otherPage.request.delete(`/api/recordings/${rec.id}`)).status()).toBe(404);
  await otherPage.goto('/account');
  await expect(otherPage.getByTestId('recordings-empty')).toBeVisible();
  await other.close();

  // Delete asks first; dismissing keeps it, accepting removes the row and the file.
  page.once('dialog', (d) => void d.dismiss());
  await page.getByTestId(`recording-delete-${rec.id}`).click();
  await expect(page.getByTestId(`recording-${rec.id}`)).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId(`recording-delete-${rec.id}`).click();
  await expect(page.getByTestId(`recording-${rec.id}`)).toHaveCount(0);
  await expect(page.getByTestId('recordings-list').locator('> div')).toHaveCount(1);
  expect(await recordingObjectExists(rec.path)).toBe(false);
  expect((await page.request.get(`/api/recordings/${rec.id}/audio`)).status()).toBe(404);

  // Recordings never touch the survey tables or the arena's responses.
  expect(await countRows('exp1_trials')).toBe(survey.e1);
  expect(await countRows('exp2_trials')).toBe(survey.e2);
  expect(await countRows('responses')).toBe(survey.r);
});

test('the upload API checks session, prompt, content type and size', async ({ page, request }) => {
  const audio = Buffer.from('RIFF0000WAVEfmt fake');
  expect((await request.post('/api/recordings?prompt=exp1-broad', { headers: { 'Content-Type': 'audio/wav' }, data: audio })).status()).toBe(401);

  await signIn(page, 'dave');
  const post = (prompt: string, type: string, data: Buffer) =>
    page.request.post(`/api/recordings?prompt=${encodeURIComponent(prompt)}`, { headers: { 'Content-Type': type }, data });
  expect((await post('exp1-nonsense', 'audio/wav', audio)).status()).toBe(400);
  expect((await post('../../etc/passwd', 'audio/wav', audio)).status()).toBe(400);
  expect((await post('exp1-broad', 'text/plain', audio)).status()).toBe(415);
  expect((await post('exp1-broad', 'audio/wav', Buffer.alloc(5 * 1024 * 1024 + 1))).status()).toBe(413);
  const ok = await post('exp2-servant_actress-b', 'audio/wav', audio);
  expect(ok.status()).toBe(201);
  const { id } = (await ok.json()) as { id: number };
  const row = await recordingById(id);
  expect(row.experiment).toBe(2);
  expect(row.path).toMatch(/^\d+\/[0-9a-f-]{36}\.wav$/);
});
