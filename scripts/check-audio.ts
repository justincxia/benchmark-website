// Container boot guard: exits non-zero unless AUDIO_DIR holds at least one referenced clip,
// the same way the seeder refuses to leave the database unseeded.
import { audioDir, readManifest } from '../lib/clip-manifest.ts';
import { loadAllClips } from '../lib/stimuli.ts';

try {
  const all = loadAllClips();
  const n = readManifest(audioDir(), all).length;
  console.log(`Stimuli: ${n} of ${all.length} referenced clips present in ${audioDir()}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
