import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getManifest, audioDir, clipPath } from '@/lib/clip-manifest';

// Reads the filesystem per request; nothing here is prerenderable.
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg' };

export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;

  // The manifest is the allowlist. The requested name is only ever compared against manifest
  // entries; the path opened is the entry's own, built from the stimulus CSVs.
  let clip;
  try {
    clip = getManifest().find((c) => c.file === file);
  } catch {
    return new Response('Stimuli unavailable', { status: 503 });
  }
  if (!clip) return new Response('Not found', { status: 404 });

  const full = clipPath(audioDir(), clip);
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const ext = clip.file.slice(clip.file.lastIndexOf('.') + 1);
  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  // Safari will not play media from a server that ignores Range.
  const range = request.headers.get('range');
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (match && !(match[1] === '' && match[2] === '')) {
    const start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
    const end = match[1] === '' || match[2] === '' ? size - 1 : Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
      });
    }
    const last = Math.min(end, size - 1);
    const stream = Readable.toWeb(createReadStream(full, { start, end: last })) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${last}/${size}`, 'Content-Length': String(last - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
