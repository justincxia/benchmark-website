// Copies just the clips the two experiments reference out of a local clone of
// github.com/justincxia/tts-sts-audio into AUDIO_DIR (default data/audio), keeping the repo's
// relative layout. Fails if any referenced clip is missing from the source.
//
//   npm run copy-audio -- /path/to/tts-sts-audio

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { audioDir } from '../lib/clip-manifest.ts';
import { loadAllClips } from '../lib/stimuli.ts';

const src = process.argv[2];
if (!src) {
  console.error('Usage: npm run copy-audio -- <path to a tts-sts-audio clone>');
  process.exit(1);
}
const dest = audioDir();
const clips = loadAllClips();
const missing = clips.filter((c) => !existsSync(path.join(src, c.relPath)));
if (missing.length) {
  console.error(`${missing.length} referenced clip(s) are missing from ${src}:`);
  for (const c of missing.slice(0, 20)) console.error(`  ${c.relPath}`);
  process.exit(1);
}

let copied = 0;
let bytes = 0;
for (const c of clips) {
  const to = path.join(dest, c.relPath);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(path.join(src, c.relPath), to);
  bytes += statSync(to).size;
  copied++;
}
const exp1 = clips.filter((c) => c.experiment === 1).length;
console.log(
  `Copied ${copied} clips (${exp1} Exp 1, ${copied - exp1} Exp 2, ${(bytes / 1e6).toFixed(1)} MB) into ${dest}`
);
