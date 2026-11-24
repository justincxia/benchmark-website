// Server-only. The SONA consent form's time estimate, from the real durations of the Exp 1
// clips (recorded in the stimuli manifest when the audio was prepared).

import type { Clip } from './clips.ts';
import { clipDuration } from './clip-manifest.ts';
import { estimateMinutes } from './sona.ts';

/** The known durations of the Exp 1 clips among `clips`. */
export function exp1Durations(clips: Clip[], durationOf: (file: string) => number | null = clipDuration): number[] {
  const out: number[] = [];
  for (const c of clips) {
    if (c.experiment !== 1) continue;
    const d = durationOf(c.file);
    if (d !== null) out.push(d);
  }
  return out;
}

/** "About N minutes" for the current manifest. */
export function sonaMinutes(clips: Clip[]): number {
  return estimateMinutes(exp1Durations(clips));
}
