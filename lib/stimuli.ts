// Server-only. The stimulus lists (copied into seed/ from the two surveys) and the set of clip
// files they reference. The parsing functions are pure over CSV text so tests can feed them
// fixtures; the `load*` helpers read the copies in seed/.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsvRecords } from './csv.ts';
import { modelByKey } from './models.ts';
import { isExp1Condition, isExp2Condition, type Exp2Sentence } from './experiments.ts';
import type { Clip } from './clips.ts';

export function seedDir(): string {
  return path.join(process.cwd(), 'seed');
}

const EXP1_STIMULI_HEADER = 'id,condition,provider,dirpath,prefix,ext,takes,text,correctAnswer';
const AUDIO_SOURCES_HEADER = 'section,model,condition,variant,dirpath,prefix,ext,takes';
const EXP2_STIMULI_HEADER = 'id,condition,variant,slot,text,option_a,option_b,correctAnswer';

function checkHeader(name: string, header: string[], expected: string) {
  if (header.join(',') !== expected) throw new Error(`Unexpected ${name} header: ${header.join(',')}`);
}

function takesOf(s: string, where: string): number[] {
  const takes = s.split(';').map((x) => Number(x.trim()));
  if (takes.length === 0 || takes.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(`Bad takes "${s}" in ${where}`);
  }
  return takes;
}

/** Exp 1 clips from stimuli_focus.csv: every non-attention-check row × its takes. */
export function exp1ClipsFromCsv(text: string): Clip[] {
  const { header, records } = parseCsvRecords(text);
  checkHeader('Exp 1 stimuli', header, EXP1_STIMULI_HEADER);
  const clips: Clip[] = [];
  for (const r of records) {
    if (r.condition === 'attention_check') continue;
    const m = modelByKey(r.provider);
    if (!m || !m.exp1) throw new Error(`Unknown Exp 1 provider in stimuli: ${r.provider}`);
    if (!isExp1Condition(r.condition)) throw new Error(`Unknown Exp 1 condition: ${r.condition}`);
    for (const take of takesOf(r.takes, `Exp 1 stimuli row ${r.id}`)) {
      const file = `${r.prefix}_${take}.${r.ext}`;
      clips.push({
        file,
        relPath: `${r.dirpath}/${file}`,
        experiment: 1,
        provider: r.provider,
        condition: r.condition,
        variant: null,
        take,
      });
    }
  }
  return clips;
}

/** Exp 2 clips from audio_sources.csv: the `ambiguity` section, restricted to the five
 *  ambiguityBaseline sentences (the file also lists sentences the survey does not use). */
export function exp2ClipsFromCsv(text: string): Clip[] {
  const { header, records } = parseCsvRecords(text);
  checkHeader('Exp 2 audio sources', header, AUDIO_SOURCES_HEADER);
  const clips: Clip[] = [];
  for (const r of records) {
    if (r.section !== 'ambiguity' || !isExp2Condition(r.condition)) continue;
    const m = modelByKey(r.model);
    if (!m || !m.exp2) throw new Error(`Unknown Exp 2 provider in audio sources: ${r.model}`);
    if (r.variant !== 'a' && r.variant !== 'b') throw new Error(`Bad Exp 2 variant: ${r.variant}`);
    for (const take of takesOf(r.takes, `audio sources ${r.model}/${r.condition}/${r.variant}`)) {
      const file = `${r.prefix}_${take}.${r.ext}`;
      clips.push({
        file,
        relPath: `${r.dirpath}/${file}`,
        experiment: 2,
        provider: r.model,
        condition: r.condition,
        variant: r.variant,
        take,
      });
    }
  }
  return clips;
}

/** The five sentences and their two readings, in stimulus-file order. */
export function exp2SentencesFromCsv(text: string): Exp2Sentence[] {
  const { header, records } = parseCsvRecords(text);
  checkHeader('Exp 2 stimuli', header, EXP2_STIMULI_HEADER);
  const out = new Map<string, Exp2Sentence>();
  for (const r of records) {
    if (r.condition === 'attention_check') continue;
    if (!isExp2Condition(r.condition)) throw new Error(`Unknown Exp 2 sentence: ${r.condition}`);
    if (!out.has(r.condition)) {
      out.set(r.condition, { condition: r.condition, text: r.text, optionA: r.option_a, optionB: r.option_b });
    }
  }
  return [...out.values()];
}

/** Every clip either experiment can play, with basenames asserted unique: the audio route and
 *  the response validator look clips up by basename alone. */
export function allClipsFrom(exp1Text: string, sourcesText: string): Clip[] {
  const clips = [...exp1ClipsFromCsv(exp1Text), ...exp2ClipsFromCsv(sourcesText)];
  const seen = new Set<string>();
  for (const c of clips) {
    if (seen.has(c.file)) throw new Error(`Duplicate clip basename across the corpus: ${c.file}`);
    seen.add(c.file);
  }
  return clips;
}

function readSeed(name: string): string {
  return readFileSync(path.join(seedDir(), name), 'utf8');
}

export function loadAllClips(): Clip[] {
  return allClipsFrom(readSeed('exp1_stimuli.csv'), readSeed('exp2_audio_sources.csv'));
}

export function loadExp2Sentences(): Exp2Sentence[] {
  return exp2SentencesFromCsv(readSeed('exp2_stimuli.csv'));
}
