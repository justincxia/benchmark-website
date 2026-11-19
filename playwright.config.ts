import { defineConfig } from '@playwright/test';

const N = 'node --disable-warning=ExperimentalWarning';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3100',
    // The Record tab: a fake microphone (a test tone) granted without a prompt.
    permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  webServer: {
    // Short tone fixture stimuli + a fresh database seeded from the real seed/ CSVs (no Exp 1
    // results), served by a dev server with its own build dir so `npm run dev` can keep running.
    command: `rm -rf .test-data/recordings && ${N} tests/fixtures/make-audio.ts .test-data/audio && ${N} scripts/seed.ts --fresh && next dev -p 3100`,
    url: 'http://localhost:3100/leaderboard',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_PATH: '.test-data/arena.db',
      NEXT_DIST_DIR: '.next-test',
      AUDIO_DIR: '.test-data/audio',
      RECORDINGS_DIR: '.test-data/recordings',
      // Enables POST /api/auth/test-login (refused under NODE_ENV=production).
      AUTH_TEST_BYPASS: '1',
      // Placeholder credentials: enough to render the sign-in button and build the redirect to
      // Google; no test ever completes a real Google sign-in.
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    },
  },
});
