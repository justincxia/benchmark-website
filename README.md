# Prosody Bench

A Next.js app that presents two human perception experiments on TTS/STS models — Experiment 1
(prosodic focus) and Experiment 2 (syntactic ambiguity) — ranks the models on a leaderboard, and
lets visitors take the survey trials themselves in an arena. Every displayed number is computed
from the seeded survey data in Supabase Postgres; arena submissions go to a separate `responses`
table that no page reads.

Pages: `/` (an intro), `/leaderboard`, `/arena`, `/record`, `/account` and `/privacy`. The sub-nav
has Leaderboard, Arena and Record. The leaderboard shows one experiment at a time (`?exp=1` or
`?exp=2`; the old `/experiment-1` and `/experiment-2` addresses redirect there): its results table,
bar charts drawn from the same numbers, the acoustic plots, and example clips, with every
description behind an (i) button. The plot images in `public/plots` are copies of `PURM/plots/*.png`
renamed to the model keys in `lib/models.ts` (`lib/plots.ts` lists them); the site-name pill (top left) links to `/`, the user-icon pill (top right) links to `/account`,
and its cog opens a preferences menu (for now one row, Theme, with the Light/Dark switcher; the
only theme control). Every page ends with a centered footer line, "Made by Penn Phonetics Lab - Privacy policy", with the last two words linked to `/privacy`. APIs:
`GET /api/audio/<file>` (manifest-allowlisted, supports `Range`), `POST /api/responses`, the
sign-in routes under `/api/auth/`, and the recording routes under `/api/recordings`.

### The intro page (`/`)

A scrollytelling story, "Meaning beyond words", in five full-viewport steps plus an ending with
"See the leaderboard" and "Try the arena". Behind the steps a pinned background crossfades
between five animated text-art pieces (`lib/intro-art.ts`, rendered by
`components/text-art.tsx`): characters in IBM Plex Mono, drawn into a grid at three brightness
levels and written as three stacked `<pre>` layers (three text writes per frame, ~24 fps). Only
the visible piece animates; animation stops when the story is scrolled away or the tab is
hidden, and `prefers-reduced-motion` gets static art and no scroll transitions. The art is
`aria-hidden`; the story is real text.

## Setup

Node **24 or newer** (native TypeScript type stripping) and, for local development and tests,
Docker (the local Supabase stack).

```bash
npm ci
cp .env.example .env.local      # then fill in the values (see below)
```

### Data: Supabase

All tables (`exp1_trials`, `exp2_trials`, `responses`, `users`, `sessions`, `recordings`, and the
SONA survey's `sona_*`) live in Supabase Postgres, and Record-tab uploads live in a private
Supabase Storage bucket. The schema is in `supabase/migrations/`. Only server code talks to
Supabase, over HTTPS with `@supabase/supabase-js` and the service-role key; every table has row
level security on with no policies, so the public (anon) key can read nothing. (HTTPS rather than
a Postgres TCP driver because HuggingFace Spaces only allow outbound ports 80, 443 and 8080.)

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | e.g. `https://<project>.supabase.co`, or `http://127.0.0.1:54321` locally |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role (secret) key. Server-only: never prefix it `NEXT_PUBLIC_`; `lib/db/client.ts` imports `server-only`, so a client component that pulls it in fails the build |
| `SUPABASE_RECORDINGS_BUCKET` | optional, default `recordings` (the migration creates that bucket; create another by hand if you change it) |

### Local Supabase

```bash
npm run db:start   # supabase start: Postgres, PostgREST and Storage in Docker; applies migrations
npm run db:reset   # re-apply every migration to an empty database, then seed from seed/
npm run db:stop
```

`npx supabase status` prints the local URL and keys; put `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from it in `.env.local` for `npm run dev`. The test scripts don't need
that: they run through `scripts/with-local-supabase.ts`, which always points them at the local
stack (and the DB tests refuse any other host).

## Seed the database

```bash
npm run seed                                   # idempotent: a table that has rows is left alone
npm run seed -- --fresh                        # replace the trial tables' rows (never responses/users/recordings)
npm run seed -- --exp1=path/to/results.csv     # also load Exp 1 results
```

`npm run seed` uses `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from the environment (load
`.env.local` with e.g. `node --env-file=.env.local`, or export them). Each table is inserted in one
call (the `seed_exp1_trials` / `seed_exp2_trials` functions), so a failure leaves no partial table.

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
is stored for reference only. The leaderboard's counts come from three views
(`exp1_counts`, `exp2_counts`, `exp2_interp_by_sentence`); `tests/fixtures/baseline-metrics.json`
holds their expected output, captured from the SQLite version, and a unit test checks it.

## Copy the audio

The stimuli come from a local clone of https://github.com/justincxia/tts-sts-audio. Only the
clips the experiments reference (250 for Exp 1, 510 for Exp 2's five sentences, ~150 MB) are
copied, keeping the repo's relative layout:

```bash
npm run copy-audio -- /path/to/tts-sts-audio   # → data/audio/ (or AUDIO_DIR)
```

`AUDIO_DIR` overrides the location (default `data/audio`). Without audio the arena shows
"Stimuli unavailable" and the example players show "Audio unavailable".

## The arena

`/arena` opens on a start screen: the instructions, the Experiment 1 / Experiment 2 choice and
a **Play now** button. Play now hides them for the rest of the visit (`sessionStorage`, so a
reload stays in the game; a small "Instructions" control brings the start screen back without
losing progress). The play screen is laid out to fit one screen without scrolling, down to
375×667: a header line ("Experiment 1 · Clip 3 of 50"), the clip, and one question at a time.

Questions are a picker card: the survey's wording, the options as rows, a "1 of 3" step
indicator, and Back / Next. Next needs a pick; Back keeps earlier answers and lets them be
changed; the last question has Submit, which also needs the clip to have been played through
once. Keys: the number or letter shown on a row picks it, Enter is Next / Submit, Space plays
or pauses.

The clip graphic is a real loudness meter, not decoration. On play, the `<audio>` element is
routed through a Web Audio `AnalyserNode` (`lib/loudness.ts`); every animation frame the RMS
level is read and written into the bar for the slice of the clip being played (48 bars, scaled
to the loudest reading so far). Nothing is drawn for a part of the clip that has not been
played, and the timeline clears on restart and on the next clip. Be aware of what this means
for Experiment 1: a louder word shows as taller bars, so the graphic can visually hint at the
emphasized word as the clip plays. (The reference site used fake bars for exactly that
reason.) With `prefers-reduced-motion`, or where Web Audio is unavailable, the graphic is a
plain progress bar.

## Run

```bash
npm run dev                    # http://localhost:3000
npm run build && npm start     # production build
```

## Google sign-in and recordings

Sign-in is optional: every page except `/record` (and the recordings list on `/account`) works
signed out, and arena responses are never linked to an account. Signed-in users can record
themselves reading each prompt on `/record` (Exp 1: "Molly mailed a melon." once per focus
condition, shown with the question it answers; Exp 2: each sentence once per interpretation),
and list, play and delete their own recordings on `/account`.

The flow is OpenID Connect's authorization code flow with `state`, `nonce` and PKCE (S256),
hand-rolled with `fetch` in `lib/auth.ts` (no dependency). Users and sessions are stored in
Supabase (`users`, `sessions`; only a SHA-256 of the session token is stored). Supabase Auth is not
used. The
session cookie `pb_session` is httpOnly, SameSite=Lax, 30 days, and `Secure` under
`NODE_ENV=production`.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | sign-in | from the OAuth client below |
| `GOOGLE_CLIENT_SECRET` | sign-in | from the OAuth client below; keep it secret (an HF Space *secret*) |
| `APP_URL` | sign-in behind a proxy | public origin, e.g. `https://<user>-<space>.hf.space`; the redirect URI is `$APP_URL/api/auth/callback`. Defaults to the request's own origin, which is fine for localhost |

Without both Google variables, `/account` shows "Sign-in isn't configured on this server"
instead of the button, and the rest of the site works as before.

### Google Cloud setup (once)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience):
   app name, support email; user type *External*. While the app is in *Testing*, add the Google
   accounts allowed to sign in under *Test users*. Scopes needed: `openid`, `email`, `profile`
   (non-sensitive).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web
   application*. Under **Authorized redirect URIs** add:
   - `http://localhost:3000/api/auth/callback` (local dev)
   - `https://<user>-<space>.hf.space/api/auth/callback` (the HF Space's direct URL)
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (a local
   `.env.local`, or the Space's *Settings → Variables and secrets*), and on the Space also set
   `APP_URL=https://<user>-<space>.hf.space`.

Google refuses sign-in inside iframes and the cookie is SameSite=Lax, so on HF use the Space's
direct `*.hf.space` URL, not the embedded huggingface.co page.

## Tests

```bash
npm run db:start    # once per boot: the local Supabase stack (Docker)
npm run test:unit   # node --test tests/unit/*.test.ts, one file at a time, against local Supabase
npm run test:e2e    # Playwright; first time: npx playwright install chromium
npm test            # both
npm run lint
```

Both suites run against the **local** Supabase stack, never the hosted project:
`scripts/with-local-supabase.ts` fills `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from
`supabase status`, and the test helpers refuse a non-local host. Pure-logic unit tests (`csv`,
`metrics`, `response-input`, …) don't touch the database; the DB ones use unique keys and clean up
after themselves. The e2e suite runs `npm run db:reset` (every table emptied, migrations
re-applied, seeded from `seed/`), writes short tone fixture stimuli to `.test-data/audio`, and boots
its own dev server on port 3100 with a separate build directory (`.next-test`), so it runs
alongside `npm run dev` (which shares the local database, so expect it to be reset). The fixture stimuli are a tone that is quiet, then loud, which the arena's loudness-meter test relies on. It asserts the leaderboard's Exp 2 numbers exactly, the arena flow (start screen, one question at a time, Back, Submit gating, keys, fits one screen at 1280×800 and 375×667, loudness bars), the intro page (steps, links, reduced motion, 375px, no console errors, no requests to other hosts), the footer link on every page, the column sorting, that an
arena submission adds exactly one `responses` row, reveals nothing, and leaves the survey
tables unchanged; the cog menu; `/account` signed out and in; and recording upload, listing,
playback access control and delete. Exp 1 metrics are covered by the unit tests via
`tests/fixtures/exp1_results.csv`.

Signing in under test uses `POST /api/auth/test-login`, which exists only when
`AUTH_TEST_BYPASS=1` (set by `playwright.config.ts`) and `NODE_ENV` is not `production`.
Playwright also sets placeholder Google credentials (so the sign-in button and the redirect to
Google can be checked) and Chromium's fake-microphone flags. No test performs a real Google
sign-in.

## Deployment

HuggingFace Docker Space (`Dockerfile`, port 7860, uid 1000). Enable persistent storage and
upload the stimuli to `/data/audio` (same layout as `data/audio`); the image sets
`AUDIO_DIR=/data/audio` and refuses to start without stimuli. All other data is in Supabase.

Space *secrets*: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`; *variables*:
`GOOGLE_CLIENT_ID`, `APP_URL`, and optionally `SUPABASE_RECORDINGS_BUCKET` and
`SONA_COMPLETION_URL`.

### Production cut-over (from the SQLite version)

1. Create the Supabase project. Apply the migrations:
   `npx supabase link --project-ref <ref>` then `npx supabase db push`.
2. Seed the survey tables once, from your machine:
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed`.
3. Copy the old Space's data: download `/data/arena.db` and `/data/recordings/` from the running
   Space, then
   `npm run migrate-sqlite -- --sqlite=arena.db --recordings-dir=recordings --dry-run`
   (prints per-table counts and anything it would skip), then the same without `--dry-run`. It
   keeps ids, resets the identity sequences, copies the recording files into the bucket, is safe to
   re-run, and verifies the counts at the end. The trial tables are not copied (step 2 reseeds them).
4. Set the Space secrets above and deploy the new image.
5. Verify: the leaderboard shows the same numbers as before, the migration script's verify step
   passed, and a signed-in test account can play an old recording.

The old `/data/arena.db` and `/data/recordings` can be deleted from the volume once you're satisfied.

## Where things live

- `app/<route>/page.tsx` — thin server components wrapping `components/<route>-page.tsx` in `PageShell`
- `lib/models.ts` — the one model list (provider key, display name, which experiments)
- `lib/experiments.ts` — survey wording and conditions
- `lib/db/` — the only code that talks to Supabase: `client.ts` (the cached service-role client,
  `server-only`), `types.ts` (row types; the only part client components may import), and
  `trials.ts`, `responses.ts`, `auth.ts`, `recordings.ts`, `sona.ts`
- `supabase/migrations/` — the schema, views, seeding functions, RLS and the recordings bucket
- `lib/metrics.ts` — counts → displayed metrics, half-up rounding, sorting
- `lib/stimuli.ts`, `lib/clips.ts`, `lib/clip-manifest.ts` — stimulus lists, arena blocks, the audio allowlist
- `lib/response-input.ts` — arena submission validation (ground truth from the clip)
- `components/arena-page.tsx`, `lib/loudness.ts` — the arena (start screen, question picker) and its Web Audio loudness meter
- `lib/theme.tsx` — light/dark tokens applied through inline styles, not Tailwind dark mode (not persisted)
- `components/site-header.tsx` — site name, account icon, cog preferences menu (`PREFERENCES` rows)
- `components/intro-page.tsx`, `components/text-art.tsx`, `lib/intro-art.ts` — the intro page
- `components/privacy-page.tsx` — the privacy policy (contains `[CONTACT NAME / EMAIL]` and `[TO BE DECIDED: …]` placeholders to fill in)
- `lib/auth.ts` — Google OIDC (state, nonce, PKCE) and cookie sessions; `lib/current-user.ts`, `lib/request-user.ts`
- `lib/prompts.ts`, `lib/recording-input.ts`, `lib/recordings-store.ts` — Record-tab prompts, upload checks, Storage bucket access
- `scripts/seed.ts`, `scripts/copy-audio.ts`, `scripts/check-audio.ts`, `scripts/migrate-sqlite-to-supabase.ts`, `scripts/with-local-supabase.ts`
