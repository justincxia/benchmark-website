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
    // Short tone fixture stimuli + the local Supabase reset (migrations re-applied, every table
    // empty) and seeded from the real seed/ CSVs (no Exp 1 results), served by a dev server with
    // its own build dir so `npm run dev` can keep running. `npm run test:e2e` puts the local
    // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment, which the server inherits.
    command: `${N} tests/fixtures/make-audio.ts .test-data/audio && ${N} scripts/prepare-stimuli.ts --from=.test-data/audio --no-copy --allow-missing --manifest=.test-data/stimuli-manifest.json && npm run db:reset && next dev -p 3100`,
    url: 'http://localhost:3100/leaderboard',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: '.next-test',
      // Tone fixtures streamed from disk (next.config.ts rewrites /stimuli/* to /api/audio), with
      // their own manifest, so the real audio in public/stimuli/ is never involved.
      AUDIO_DIR: '.test-data/audio',
      STIMULI_MANIFEST: '.test-data/stimuli-manifest.json',
      // Enables POST /api/auth/test-login (refused under NODE_ENV=production).
      AUTH_TEST_BYPASS: '1',
      // A same-origin stand-in for the SONA credit URL (85-sona checks it is revealed only on completion).
      SONA_COMPLETION_URL: 'http://localhost:3100/privacy?sona_code=%SURVEY_CODE%',
      // Placeholder credentials: enough to render the sign-in button and build the redirect to
      // Google; no test ever completes a real Google sign-in.
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    },
  },
});
