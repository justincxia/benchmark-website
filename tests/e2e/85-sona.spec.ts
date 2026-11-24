import { test, expect, type Page } from '@playwright/test';
import { countRows, db, playThrough, servedClip } from './helpers';

const URL_DEBUG = '/arena/sonasurvey?debug=1&id=TEST123';

/** Watches every request to /api/sona/*. */
function sonaRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/sona/')) seen.push(`${r.method()} ${r.url()}`);
  });
  return seen;
}

async function consent(page: Page) {
  await expect(page.getByTestId('sona-consent')).toBeVisible();
  await page.getByTestId('sona-consent-check').check();
  await page.getByTestId('sona-agree').click();
  await expect(page.getByTestId('sona-instructions')).toBeVisible();
}

async function passVolumeCheck(page: Page) {
  await expect(page.getByTestId('sona-start')).toBeDisabled();
  await page.getByTestId('sona-volume-play').click();
  await expect(page.getByTestId('sona-start')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('sona-start').click();
  await expect(page.getByTestId('sona-trials')).toBeVisible();
}

/** Answers the clip on screen: 4, AI, "What happened?", with one Back along the way. */
async function answerClip(page: Page) {
  await playThrough(page);
  await page.getByTestId('arena-nat-4').click();
  await page.getByTestId('arena-next-question').click();
  await page.getByTestId('arena-hai-AI').click();
  // Back works within the clip's questions.
  await page.getByTestId('arena-back').click();
  await expect(page.getByTestId('arena-prompt')).toContainText('naturalness');
  await page.getByTestId('arena-next-question').click();
  await page.getByTestId('arena-next-question').click();
  await page.getByTestId('arena-q-4').click();
  await page.getByTestId('arena-submit').click();
}

async function debugSessionId(page: Page): Promise<string> {
  const text = (await page.getByTestId('sona-debug-session').textContent()) ?? '';
  const id = text.match(/[0-9a-f-]{36}/)?.[0];
  expect(id).toBeTruthy();
  return id as string;
}

test('the e2e stimuli give a full 50-cell Experiment 1 block', async ({ page }) => {
  // The server refuses (503) to start a session without exactly 50 clips.
  const res = await page.request.post('/api/sona/session', { data: { debug: true, sonaId: 'CELLS' } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.block).toHaveLength(3);
  const row = await db().from('sona_sessions').select('block, debug, sona_id').eq('id', body.sessionId).single();
  expect(row.data).toMatchObject({ debug: true, sona_id: 'CELLS' });
  await db().from('sona_sessions').delete().eq('id', body.sessionId);
});

test('declining consent sends nothing and ends on an exit screen', async ({ page }) => {
  const seen = sonaRequests(page);
  await page.goto('/arena/sonasurvey?id=NOPE');
  await expect(page.getByTestId('sona-consent')).toContainText('I am 18 or older and agree to participate');
  await expect(page.getByTestId('sona-consent')).toContainText('[TO FILL: PI]');
  await expect(page.getByTestId('sona-consent')).toContainText(/About \d+ minutes\./);
  await expect(page.getByTestId('sona-agree')).toBeDisabled();
  await page.getByTestId('sona-consent-check').check();
  await expect(page.getByTestId('sona-agree')).toBeEnabled();
  await page.getByTestId('sona-decline').click();
  await expect(page.getByTestId('sona-declined')).toBeVisible();
  await page.waitForTimeout(500);
  expect(seen).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sona_')))).toEqual([]);
});

test('a full debug run: 3 clips, contact, thank-you; saved apart from the arena', async ({ page }) => {
  const arenaBefore = await countRows('responses');
  await page.goto(URL_DEBUG);
  // No sub-nav on this page; header and footer stay.
  await expect(page.locator('nav a', { hasText: 'Leaderboard' })).toHaveCount(0);
  await expect(page.getByText('Privacy policy')).toBeVisible();

  await consent(page);
  const sessionId = await debugSessionId(page);
  await expect(page.getByTestId('sona-instructions')).toContainText('Focus: 3 recordings of one sentence');
  // The audio check is not one of the trials.
  const volumeSrc = await page.getByTestId('sona-volume-audio').getAttribute('src');
  const session = (await db().from('sona_sessions').select('*').eq('id', sessionId).single()).data;
  expect(session).toMatchObject({ debug: true, sona_id: 'TEST123', completed_at: null });
  expect(session.block).toHaveLength(3);
  expect(session.user_agent).toBeTruthy();
  expect(session.block.map((f: string) => `/api/audio/${encodeURIComponent(f)}`)).not.toContain(volumeSrc);
  await passVolumeCheck(page);

  // The first save fails twice; the answer is retried in the background with a warning.
  let failures = 2;
  await page.route('**/api/sona/responses', (route) => (failures-- > 0 ? route.abort() : route.continue()));

  const served: string[] = [];
  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId('sona-progress')).toHaveText(`Clip ${i + 1} of 3`);
    await expect(page.getByTestId('sona-progress-bar')).toHaveAttribute('aria-valuenow', String(i));
    served.push(await servedClip(page));
    await answerClip(page);
    if (i === 0) {
      await expect(page.getByTestId('sona-saving')).toBeVisible();
      await expect(page.getByTestId('sona-saving')).toHaveCount(0, { timeout: 10_000 });
    }
  }
  expect(served).toEqual(session.block);

  // Contact: both fields required, checked in the browser.
  await expect(page.getByTestId('sona-contact')).toBeVisible();
  await expect(page.getByTestId('sona-contact-note')).toHaveText('Your name and email are stored separately from your answers.');
  await page.getByTestId('sona-contact-submit').click();
  await expect(page.getByTestId('sona-contact-error')).toHaveText('Please enter your name.');
  await page.getByTestId('sona-name').fill('Test Person');
  await page.getByTestId('sona-email').fill('nope');
  await page.getByTestId('sona-contact-submit').click();
  await expect(page.getByTestId('sona-contact-error')).toHaveText('Please enter a valid email address.');
  await page.getByTestId('sona-email').fill('test.person@example.edu');
  await page.getByTestId('sona-contact-submit').click();
  await expect(page.getByTestId('sona-thanks')).toContainText('Thank you');

  const after = (await db().from('sona_sessions').select('completed_at').eq('id', sessionId).single()).data;
  expect(after?.completed_at).toBeTruthy();
  const rs = await db().from('sona_responses').select('trial_index, clip, naturalness, human_or_ai, question_answered, response_ms').eq('session_id', sessionId).order('trial_index');
  expect(rs.data).toHaveLength(3);
  expect(rs.data!.map((r) => r.clip)).toEqual(session.block);
  for (const r of rs.data!) {
    expect(r).toMatchObject({ naturalness: 4, human_or_ai: 'AI', question_answered: 'What happened?' });
    expect(r.response_ms).toBeGreaterThan(0);
  }
  const contacts = await db().from('sona_contacts').select('name, email').eq('session_id', sessionId);
  expect(contacts.data).toEqual([{ name: 'Test Person', email: 'test.person@example.edu' }]);
  expect(await countRows('responses')).toBe(arenaBefore);

  // The API, after completion: a repeat with the same contact is idempotent, another is 409,
  // and further answers are refused.
  const again = await page.request.post('/api/sona/complete', { data: { sessionId, name: 'Test Person', email: 'TEST.person@example.edu' } });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ duplicate: true });
  const other = await page.request.post('/api/sona/complete', { data: { sessionId, name: 'Someone Else', email: 'else@example.edu' } });
  expect(other.status()).toBe(409);
  const late = await page.request.post('/api/sona/responses', {
    data: { sessionId, trialIndex: 0, clip: session.block[0], naturalness: 3, humanOrAi: 'Human', questionAnswered: 'What happened?', listenedMs: 1, responseMs: 1 },
  });
  expect(late.status()).toBe(409);
  expect((await db().from('sona_contacts').select('*', { count: 'exact', head: true }).eq('session_id', sessionId)).count).toBe(1);
});

test('the API refuses mismatched clips, unknown sessions and early completion', async ({ page }) => {
  const arenaBefore = await countRows('responses');
  const { sessionId, block } = await (await page.request.post('/api/sona/session', { data: { debug: true } })).json();
  const answer = (trialIndex: number, clip: string) => ({
    sessionId, trialIndex, clip, naturalness: 3, humanOrAi: 'Human', questionAnswered: 'What happened?', listenedMs: 500, responseMs: 2000,
  });
  expect((await page.request.post('/api/sona/responses', { data: answer(0, block[1]) })).status()).toBe(400);
  expect((await page.request.post('/api/sona/responses', { data: answer(3, block[0]) })).status()).toBe(400);
  expect((await page.request.post('/api/sona/responses', { data: { ...answer(0, block[0]), naturalness: 9 } })).status()).toBe(400);
  expect((await page.request.post('/api/sona/responses', { data: { ...answer(0, block[0]), sessionId: '00000000-0000-4000-8000-000000000000' } })).status()).toBe(404);
  expect((await page.request.post('/api/sona/responses', { data: { ...answer(0, block[0]), sessionId: 'nope' } })).status()).toBe(404);
  expect((await page.request.post('/api/sona/responses', { data: answer(0, block[0]) })).status()).toBe(201);
  const dup = await page.request.post('/api/sona/responses', { data: answer(0, block[0]) });
  expect(dup.status()).toBe(200);
  expect(await dup.json()).toMatchObject({ duplicate: true });

  const contact = { sessionId, name: 'A Person', email: 'a@example.edu' };
  expect((await page.request.post('/api/sona/complete', { data: { ...contact, email: '' } })).status()).toBe(400);
  expect((await page.request.post('/api/sona/complete', { data: contact })).status()).toBe(409);
  expect((await page.request.post('/api/sona/complete', { data: { ...contact, sessionId: '00000000-0000-4000-8000-000000000000' } })).status()).toBe(404);
  expect((await db().from('sona_contacts').select('*', { count: 'exact', head: true }).eq('session_id', sessionId)).count).toBe(0);
  expect(await countRows('responses')).toBe(arenaBefore);
  await db().from('sona_sessions').delete().eq('id', sessionId);
});

test('a reload mid-survey resumes at the same clip', async ({ page }) => {
  await page.goto(URL_DEBUG);
  await consent(page);
  const sessionId = await debugSessionId(page);
  // A reload before the trials keeps the session too.
  await page.reload();
  await expect(page.getByTestId('sona-instructions')).toBeVisible();
  expect(await debugSessionId(page)).toBe(sessionId);
  await passVolumeCheck(page);

  await answerClip(page);
  await expect(page.getByTestId('sona-progress')).toHaveText('Clip 2 of 3');
  const second = await servedClip(page);
  await page.reload();
  await expect(page.getByTestId('sona-progress')).toHaveText('Clip 2 of 3');
  expect(await servedClip(page)).toBe(second);
  expect(await debugSessionId(page)).toBe(sessionId);
  await expect.poll(async () => (await db().from('sona_responses').select('*', { count: 'exact', head: true }).eq('session_id', sessionId)).count).toBe(1);
});

test('a stored block that no longer matches the corpus shows an error, not a restart', async ({ page }) => {
  await page.goto('/arena/sonasurvey');
  await page.evaluate(() =>
    localStorage.setItem(
      'sona_state',
      JSON.stringify({ sessionId: 'abc', block: ['gone_from_the_corpus.wav'], index: 0, stage: 'trials', debug: false, sonaId: null })
    )
  );
  await page.reload();
  await expect(page.getByTestId('sona-error')).toContainText('[TO FILL: email]');
  await expect(page.getByTestId('sona-consent')).toHaveCount(0);
});

test('at 375×667 the pages fit the width and the play screen fits without scrolling', async ({ page }) => {
  const [width, height] = [375, 667];
  await page.setViewportSize({ width, height });
  const noHorizontalScroll = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

  await page.goto(URL_DEBUG);
  await noHorizontalScroll();
  await consent(page);
  await noHorizontalScroll();
  await passVolumeCheck(page);
  await servedClip(page);

  const fits = async (last: string) => {
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const id of ['sona-progress', 'sona-progress-bar', 'arena-clip', last]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, id).toBeLessThanOrEqual(height);
      expect(box.x + box.width, id).toBeLessThanOrEqual(width);
    }
    await noHorizontalScroll();
  };
  await fits('arena-question');
  await page.getByTestId('arena-nat-3').click();
  await page.getByTestId('arena-next-question').click();
  await page.getByTestId('arena-hai-AI').click();
  await page.getByTestId('arena-next-question').click();
  await page.getByTestId('arena-q-1').click();
  await fits('arena-submit');
  await fits('arena-back');
});

test('hidden: no page links to the survey, and it is marked noindex', async ({ page }) => {
  for (const path of ['/', '/leaderboard', '/leaderboard?exp=1', '/leaderboard?exp=2', '/arena', '/record', '/account', '/privacy']) {
    await page.goto(path);
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length, path).toBeGreaterThan(0);
    expect(hrefs.filter((h) => h.includes('sonasurvey')), path).toEqual([]);
  }
  const res = await page.goto('/arena/sonasurvey');
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow/);
  // Not advertised in a robots.txt.
  const robots = await page.request.get('/robots.txt');
  expect(robots.status() === 404 || !(await robots.text()).includes('sonasurvey')).toBe(true);
  // Other pages are not marked noindex.
  const arena = await page.goto('/arena');
  expect(arena?.headers()['x-robots-tag']).toBeUndefined();
});
