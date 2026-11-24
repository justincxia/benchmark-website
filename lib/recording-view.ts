// Server-only: a user's recordings shaped for the /account list.
import { listRecordings } from './db/index.ts';
import { buildPrompts } from './prompts.ts';
import { loadExp2Sentences } from './stimuli.ts';

export interface RecordingItem {
  id: number;
  experiment: 1 | 2;
  sentence: string;
  /** "Focus: molly — Who mailed a melon?" or "Interpretation A — …". */
  label: string;
  createdAt: string;
}

export async function recordingItems(userId: number): Promise<RecordingItem[]> {
  const prompts = new Map(buildPrompts(loadExp2Sentences()).map((p) => [p.id, p]));
  return (await listRecordings(userId)).map((r) => {
    const p = prompts.get(r.promptId);
    return {
      id: r.id,
      experiment: r.experiment,
      sentence: p?.sentence ?? r.promptId,
      label: p
        ? p.experiment === 1
          ? `Focus: ${p.condition} — ${p.cue}`
          : `Interpretation ${p.interpretation} — ${p.cue}`
        : r.promptId,
      createdAt: r.createdAt,
    };
  });
}
