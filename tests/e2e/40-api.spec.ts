import { test, expect } from '@playwright/test';
import { countRows, latestResponse } from './helpers';

test('audio: a manifest clip streams, with Range support', async ({ request }) => {
  const res = await request.get('/api/audio/hume_focus_melon_2.wav');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('audio/wav');
  const part = await request.get('/api/audio/hume_focus_melon_2.wav', { headers: { Range: 'bytes=0-43' } });
  expect(part.status()).toBe(206);
  expect((await part.body()).subarray(0, 4).toString()).toBe('RIFF');
});

test('audio: anything outside the manifest is a 404', async ({ request }) => {
  for (const name of [
    'nope.wav',
    encodeURIComponent('../seed/exp2_results.csv'),
    encodeURIComponent('Hume Octave Outputs/Focus/hume_focus_melon_2.wav'),
    // In the stimulus lists, but .mp3 and so not in the test corpus.
    'elevenlabs_servant_actress_a_1.mp3',
  ]) {
    expect((await request.get(`/api/audio/${name}`)).status()).toBe(404);
  }
});

test('responses: ground truth comes from the clip, not the request body', async ({ request }) => {
  const before = countRows('responses');
  const res = await request.post('/api/responses', {
    data: {
      participant: 'api-test', session: 's1', round: 0, clip: 'nova_sonic_focus_mailed_4.wav',
      naturalness: 2, humanOrAi: 'Human', questionAnswered: 'What happened?', listenedMs: 300,
      model: 'human', intendedQuestion: 'What happened?', condition: 'broad',
    },
  });
  expect(res.status()).toBe(201);
  expect(countRows('responses')).toBe(before + 1);
  const row = latestResponse();
  expect(row.model).toBe('nova_sts');
  expect(row.condition).toBe('mailed');
  expect(row.take).toBe(4);
  expect(row.intended_question).toBe('What did Molly do with the melon?');
  expect(row.question_answered).toBe('What happened?');
});

test('responses: invalid submissions are rejected and write nothing', async ({ request }) => {
  const before = countRows('responses');
  const bad = [
    { participant: 'x', session: 's', round: 0, clip: 'unknown.wav', naturalness: 3, interpretation: 'A', listenedMs: 1 },
    { participant: 'x', session: 's', round: 0, clip: 'lisa_a_1.wav', naturalness: 7, interpretation: 'A', listenedMs: 1 },
    { participant: 'x', session: 's', round: 0, clip: 'lisa_a_1.wav', naturalness: 3, humanOrAi: 'AI', listenedMs: 1 },
  ];
  for (const data of bad) expect((await request.post('/api/responses', { data })).status()).toBe(400);
  expect(countRows('responses')).toBe(before);
});
