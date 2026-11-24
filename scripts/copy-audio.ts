// Local equivalent of the Vercel build's stimuli step, from a clone you already have:
// copies the clips the experiments reference out of a local clone of
// github.com/justincxia/tts-sts-audio into public/stimuli/ and writes the stimuli manifest.
// Fails if any referenced clip is missing. (`npm run fetch-stimuli` does the same from the
// commit pinned in audio.lock, without a local clone.)
//
//   npm run copy-audio -- /path/to/tts-sts-audio

import path from 'node:path';
import { manifestPath } from '../lib/stimuli-manifest.ts';
import { prepareStimuli, summary, type PrepareOptions } from './prepare-stimuli.ts';

const src = process.argv[2];
if (!src) {
  console.error('Usage: npm run copy-audio -- <path to a tts-sts-audio clone>');
  process.exit(1);
}
const o: PrepareOptions = {
  from: src,
  out: path.join(process.cwd(), 'public', 'stimuli'),
  manifest: manifestPath(),
  allowMissing: false,
  source: null,
};
try {
  console.log(summary(prepareStimuli(o), o));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
