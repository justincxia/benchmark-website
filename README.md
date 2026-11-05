# Prosody Bench

A Next.js app that presents two human perception experiments on TTS/STS models — Experiment 1
(prosodic focus) and Experiment 2 (syntactic ambiguity) — ranks the models on a leaderboard, and
lets visitors take the survey trials themselves in an arena. Every displayed number is computed
from the seeded survey data in SQLite; arena submissions go to a separate `responses` table that
no page reads.

Pages: `/leaderboard`, `/experiment-1`, `/experiment-2`, `/arena` (`/` redirects to
`/leaderboard`). APIs: `GET /api/audio/<file>` (manifest-allowlisted, supports `Range`) and
`POST /api/responses`.

## Setup

Node **24 or newer** (`node:sqlite` and native TypeScript type stripping; the npm scripts pass
`--disable-warning=ExperimentalWarning` to keep Node 24's SQLite warning out of the output).

```bash
npm ci
```

## Seed the database

```bash
npm run seed                                   # data/arena.db, idempotent
npm run seed -- --fresh                        # delete the database and re-seed
npm run seed -- --exp1=path/to/results.csv     # also load Exp 1 results
```

Inputs live in `seed/` (copied from the two survey folders, so the app reads nothing outside
this directory):

| File | From |
| --- | --- |
| `exp1_stimuli.csv` | `TTS Focus Task/chunk_includes/stimuli_focus.csv` |
| `exp2_stimuli.csv` | `TTS MOS Task_copy/chunk_includes/stimuli_ambiguity_baseline.csv` |
| `exp2_audio_sources.csv` | `TTS MOS Task_copy/chunk_includes/audio_sources.csv` |
| `exp2_results.csv` | `TTS MOS Task_copy/summary.csv` (Exp 2 results) |
| `exp1_results.csv` | *not yet collected* — drop the per-trial Exp 1 results here (or pass `--exp1=`) |

Exp 1 results have not been collected, so the Exp 1 columns show `—`. When the CSV exists
(the output of `analyze_results.py` on the Focus survey's PCIbex export; columns per
`TTS Focus Task/DEPLOYMENT.md`), `npm run seed` loads it into the empty `exp1_trials` table
without touching Exp 2.

Each experiment has its own table (`exp1_trials`, `exp2_trials`), and seeding a table that
already has rows is a no-op. The seeder hard-fails on an unexpected header, an unknown
`provider` (or one that was not in that experiment), a recording that is not in the stimulus
lists, an intended answer that disagrees with the recording, or an answer outside the survey's
options. Attention-check rows (the 244 blank-`provider` rows in the Exp 2 file) are stored
flagged and excluded from every metric; `training` rows in Exp 1 are dropped. A trial whose
answer to a question is missing (`NA` or blank, e.g. a timed-out trial) is left out of that
question's metric only. Exp 2 ground truth is the recording's variant (`a` → A, `b` → B),
checked against `intendedInterpretation`; the results' `audioFile` uses older folder names and
is stored for reference only.

`DATABASE_PATH` overrides the database location (default `data/arena.db`).

## Copy the audio

The stimuli come from a local clone of https://github.com/justincxia/tts-sts-audio. Only the
clips the experiments reference (250 for Exp 1, 510 for Exp 2's five sentences, ~150 MB) are
copied, keeping the repo's relative layout:

```bash
npm run copy-audio -- /path/to/tts-sts-audio   # → data/audio/ (or AUDIO_DIR)
```

`AUDIO_DIR` overrides the location (default `data/audio`). Without audio the arena shows
"Stimuli unavailable" and the example players show "Audio unavailable".

## Run

```bash
npm run dev                    # http://localhost:3000
npm run build && npm start     # production build
```

## Tests

```bash
npm run test:unit   # node --test tests/unit/*.test.ts
npm run test:e2e    # Playwright; first time: npx playwright install chromium
npm test            # both
npm run lint
```

The e2e suite boots its own dev server on port 3100 with a fresh `.test-data/arena.db` seeded
from `seed/`, silent fixture stimuli in `.test-data/audio`, and a separate build directory
(`.next-test`), so it runs alongside `npm run dev`. It asserts the leaderboard's Exp 2 numbers
exactly, the column sorting, and that an arena submission adds exactly one `responses` row,
reveals nothing, and leaves the survey tables unchanged. Exp 1 metrics are covered by the unit
tests via `tests/fixtures/exp1_results.csv`.

## Deployment

HuggingFace Docker Space (`Dockerfile`, port 7860, uid 1000). Enable persistent storage and
upload the stimuli to `/data/audio` (same layout as `data/audio`). The image sets
`DATABASE_PATH=/data/arena.db` and `AUDIO_DIR=/data/audio`; on boot it refuses to start without
stimuli, seeds the database if it is empty, then serves.

## Where things live

- `app/<route>/page.tsx` — thin server components wrapping `components/<route>-page.tsx` in `PageShell`
- `lib/models.ts` — the one model list (provider key, display name, which experiments)
- `lib/experiments.ts` — survey wording and conditions
- `lib/db.ts` — the only module that touches SQLite
- `lib/metrics.ts` — counts → displayed metrics, half-up rounding, sorting
- `lib/stimuli.ts`, `lib/clips.ts`, `lib/clip-manifest.ts` — stimulus lists, arena blocks, the audio allowlist
- `lib/response-input.ts` — arena submission validation (ground truth from the clip)
- `lib/theme.tsx` — light/dark tokens applied through inline styles, not Tailwind dark mode
- `scripts/seed.ts`, `scripts/copy-audio.ts`, `scripts/check-audio.ts`
