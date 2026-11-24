// Turns a tts-sts-audio checkout (or any folder with its layout) into what the site serves:
// copies the clips the experiments reference into public/stimuli/<basename> (static files;
// on Vercel, the CDN) and writes the stimuli manifest (lib/stimuli-manifest.ts).
//
//   node scripts/prepare-stimuli.ts --from=<dir> [--out=public/stimuli] [--manifest=<path>]
//                                   [--no-copy] [--allow-missing] [--commit=<sha> --repo=<url>]
//
// By default every referenced clip must be present (a deploy must never ship silent players);
// --allow-missing is for the e2e suite's tone fixtures, which have no mp3s. --no-copy writes only
// the manifest (the e2e server streams from AUDIO_DIR instead).

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAllClips } from '../lib/stimuli.ts';
import { buildManifest, manifestPath, type StimuliManifest } from '../lib/stimuli-manifest.ts';

export interface PrepareOptions {
  from: string;
  out: string | null;
  manifest: string;
  allowMissing: boolean;
  source: StimuliManifest['source'];
}

export function prepareStimuli(o: PrepareOptions): StimuliManifest {
  const all = loadAllClips();
  const { manifest, missing } = buildManifest(o.from, all, o.source);
  if (missing.length && !o.allowMissing) {
    const list = missing.slice(0, 20).map((c) => `  ${c.relPath}`).join('\n');
    throw new Error(`${missing.length} referenced clip(s) are missing from ${o.from}:\n${list}`);
  }
  if (manifest.clips.length === 0) throw new Error(`No referenced clips found in ${o.from}`);

  if (o.out) {
    rmSync(o.out, { recursive: true, force: true });
    mkdirSync(o.out, { recursive: true });
    const present = new Set(manifest.clips.map((c) => c.file));
    for (const c of all) if (present.has(c.file)) copyFileSync(path.join(o.from, c.relPath), path.join(o.out, c.file));
  }
  mkdirSync(path.dirname(o.manifest), { recursive: true });
  writeFileSync(o.manifest, JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}

export function summary(m: StimuliManifest, o: PrepareOptions): string {
  const mb = m.clips.reduce((s, c) => s + c.bytes, 0) / 1e6;
  return (
    `Stimuli: ${m.clips.length} clips, ${mb.toFixed(1)} MB` +
    (m.source ? ` from ${m.source.repo}@${m.source.commit.slice(0, 7)}` : ` from ${o.from}`) +
    (o.out ? ` → ${o.out}` : '') +
    `; manifest ${o.manifest}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const from = opt('from');
  if (!from) {
    console.error('Usage: node scripts/prepare-stimuli.ts --from=<tts-sts-audio checkout> [--out=…] [--manifest=…]');
    process.exit(2);
  }
  const o: PrepareOptions = {
    from,
    out: args.includes('--no-copy') ? null : (opt('out') ?? path.join(process.cwd(), 'public', 'stimuli')),
    manifest: opt('manifest') ?? manifestPath(),
    allowMissing: args.includes('--allow-missing'),
    source: opt('commit') ? { repo: opt('repo') ?? '', commit: opt('commit')! } : null,
  };
  try {
    console.log(summary(prepareStimuli(o), o));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
