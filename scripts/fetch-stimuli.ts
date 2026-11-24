// The Vercel build's first step (vercel.json → npm run vercel-build): fetches the tts-sts-audio
// commit pinned in audio.lock (a shallow fetch of that one commit) and prepares the stimuli from
// it: the referenced clips into public/stimuli/ and the manifest. Fails the build if anything
// referenced is missing. To serve newer audio, change the commit in audio.lock and push.
//
//   npm run fetch-stimuli

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { manifestPath } from '../lib/stimuli-manifest.ts';
import { prepareStimuli, summary, type PrepareOptions } from './prepare-stimuli.ts';

const lock = JSON.parse(readFileSync(path.join(process.cwd(), 'audio.lock'), 'utf8')) as { repo?: unknown; commit?: unknown };
if (typeof lock.repo !== 'string' || typeof lock.commit !== 'string' || !/^[0-9a-f]{40}$/.test(lock.commit)) {
  console.error('audio.lock must be {"repo": "<git url>", "commit": "<40-char sha>"}');
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'tts-sts-audio-'));
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
try {
  console.log(`Fetching ${lock.repo} @ ${lock.commit.slice(0, 7)} …`);
  git('init', '-q');
  git('remote', 'add', 'origin', lock.repo);
  git('fetch', '-q', '--depth', '1', 'origin', lock.commit);
  git('checkout', '-q', 'FETCH_HEAD');
  const o: PrepareOptions = {
    from: dir,
    out: path.join(process.cwd(), 'public', 'stimuli'),
    manifest: manifestPath(),
    allowMissing: false,
    source: { repo: lock.repo, commit: lock.commit },
  };
  console.log(summary(prepareStimuli(o), o));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
