// Validation for a Record-tab upload. Pure: the route handler passes in the prompt list,
// the declared content type and the byte count it actually read.

import type { Prompt } from './prompts.ts';

// 4 MB: Vercel rejects any function request body over 4.5 MB before our code runs, so the cap
// must sit below that to answer with our own 413. A spoken sentence is ~50 KB.
export const MAX_RECORDING_BYTES = 4 * 1024 * 1024;
export const MAX_RECORDING_LABEL = `${MAX_RECORDING_BYTES / (1024 * 1024)} MB`;

/** File extension for a stored recording, chosen from the base MIME type — never from input. */
const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'audio';
}

/** `audio/webm;codecs=opus` → `audio/webm`; null unless it is an audio/* type. */
export function baseAudioMime(contentType: string | null): string | null {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/.test(base) ? base : null;
}

export function validateRecordingUpload(
  input: { promptId: string | null; contentType: string | null; size: number },
  prompts: Prompt[]
): { value: { prompt: Prompt; mime: string } } | { error: string; status: number } {
  const prompt = prompts.find((p) => p.id === input.promptId);
  if (!prompt) return { error: 'unknown prompt', status: 400 };
  const mime = baseAudioMime(input.contentType);
  if (!mime) return { error: 'content type must be audio/*', status: 415 };
  if (input.size === 0) return { error: 'empty recording', status: 400 };
  if (input.size > MAX_RECORDING_BYTES) return { error: `recording too large (max ${MAX_RECORDING_LABEL})`, status: 413 };
  return { value: { prompt, mime } };
}
