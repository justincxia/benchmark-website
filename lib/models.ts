// The one model list. Every page, the seeder, the stimulus manifest and the arena import it;
// nothing else in the app keeps its own copy. Pure — safe in client components.

export interface Model {
  /** The `provider` value used by the stimulus CSVs and the survey results. */
  key: string;
  /** Display name. */
  name: string;
  /** Took part in Experiment 1 (focus). */
  exp1: boolean;
  /** Took part in Experiment 2 (ambiguity). */
  exp2: boolean;
}

export const MODELS: readonly Model[] = [
  { key: 'elevenlabs', name: 'ElevenLabs eleven_v3', exp1: true, exp2: true },
  { key: 'elevenlabs_v4', name: 'ElevenLabs eleven_v4', exp1: true, exp2: false },
  { key: 'gemini_tts', name: 'Gemini 3.1 Flash TTS', exp1: true, exp2: true },
  { key: 'gemini_live', name: 'Gemini 3.1 Flash Live', exp1: true, exp2: true },
  { key: 'openai_tts', name: 'OpenAI gpt-4o-mini-tts', exp1: true, exp2: true },
  { key: 'openai_sts', name: 'OpenAI gpt-realtime-2', exp1: true, exp2: true },
  { key: 'hume', name: 'Hume Octave', exp1: true, exp2: true },
  { key: 'grok_tts', name: 'Grok TTS', exp1: true, exp2: true },
  { key: 'grok_sts', name: 'Grok Voice', exp1: true, exp2: true },
  { key: 'nova_sts', name: 'Amazon Nova 2 Sonic', exp1: true, exp2: true },
  { key: 'human', name: 'Human', exp1: false, exp2: true },
];

export type Experiment = 1 | 2;

export function modelByKey(key: string): Model | undefined {
  return MODELS.find((m) => m.key === key);
}

export function inExperiment(m: Model, exp: Experiment): boolean {
  return exp === 1 ? m.exp1 : m.exp2;
}

export function modelsIn(exp: Experiment): Model[] {
  return MODELS.filter((m) => inExperiment(m, exp));
}
