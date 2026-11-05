import { defineConfig } from '@playwright/test';

const N = 'node --disable-warning=ExperimentalWarning';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    // Silent fixture stimuli + a fresh database seeded from the real seed/ CSVs (no Exp 1
    // results), served by a dev server with its own build dir so `npm run dev` can keep running.
    command: `${N} tests/fixtures/make-audio.ts .test-data/audio && ${N} scripts/seed.ts --fresh && next dev -p 3100`,
    url: 'http://localhost:3100/leaderboard',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_PATH: '.test-data/arena.db',
      NEXT_DIST_DIR: '.next-test',
      AUDIO_DIR: '.test-data/audio',
    },
  },
});
