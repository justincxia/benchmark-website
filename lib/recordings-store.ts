// Server-only. Record-tab uploads live in the private Storage bucket (recordingsBucket()).
// Object keys are generated here, `<userId>/<uuid>.<ext>`; nothing from the request is ever
// part of a key.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { check, getSupabase, recordingsBucket } from './db/client.ts';
import { extensionFor } from './recording-input.ts';

/** Uploads the bytes and returns the object key. */
export async function saveRecordingFile(userId: number, mime: string, bytes: Uint8Array): Promise<string> {
  const key = `${userId}/${randomUUID()}.${extensionFor(mime)}`;
  check(
    await getSupabase().storage.from(recordingsBucket()).upload(key, bytes, { contentType: mime, upsert: false }),
    'upload recording'
  );
  return key;
}

/** Removes the object; removing one that is already gone is not an error. */
export async function removeRecordingFile(key: string): Promise<void> {
  check(await getSupabase().storage.from(recordingsBucket()).remove([key]), 'remove recording');
}

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/** Parses a Range header against a body of `size` bytes, the same way app/api/audio/[file]
 *  does: null → serve it whole (no header, or one we don't understand); 'unsatisfiable' → 416. */
export function parseByteRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
  const end = match[1] === '' || match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return 'unsatisfiable';
  }
  return { start, end: Math.min(end, size - 1) };
}

/** Fetches an object (or one byte range of it) from Storage as a streaming Response. Null when
 *  the object does not exist. The Range is forwarded, so only the requested bytes travel. */
export async function fetchRecordingObject(key: string, range?: ByteRange): Promise<Response | null> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  const objectPath = [recordingsBucket(), ...key.split('/')].map(encodeURIComponent).join('/');
  const headers: Record<string, string> = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  if (range) headers.Range = `bytes=${range.start}-${range.end}`;
  const res = await fetch(`${url.replace(/\/+$/, '')}/storage/v1/object/authenticated/${objectPath}`, {
    headers,
    cache: 'no-store',
  });
  if (res.ok) return res;
  // Storage reports a missing object as 400 with {"statusCode":"404","error":"not_found"}
  // (newer versions as a plain 404).
  const text = await res.text().catch(() => '');
  if (res.status === 404 || /not_found|NoSuchKey|"404"/.test(text)) return null;
  throw new Error(`fetch recording: storage returned ${res.status}`);
}

/** The audio response for a recording the caller has already checked the user owns: 200 whole,
 *  206 for a satisfiable Range, 416 for an unsatisfiable one, 404 if the object is gone.
 *  Only the body and a fixed set of headers are passed through from Storage. */
export async function recordingAudioResponse(
  rec: { path: string; mime: string; size: number },
  rangeHeader: string | null
): Promise<Response> {
  const base: Record<string, string> = {
    'Content-Type': rec.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };
  const range = parseByteRange(rangeHeader, rec.size);
  if (range === 'unsatisfiable') {
    // Still a 404 when the object itself is missing.
    const head = await fetchRecordingObject(rec.path, { start: 0, end: 0 });
    if (!head) return new Response('Not found', { status: 404 });
    await head.body?.cancel();
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${rec.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' },
    });
  }
  const upstream = await fetchRecordingObject(rec.path, range ?? undefined);
  if (!upstream) return new Response('Not found', { status: 404 });
  if (range && upstream.status === 206) {
    return new Response(upstream.body, {
      status: 206,
      headers: {
        ...base,
        'Content-Range': upstream.headers.get('content-range') ?? `bytes ${range.start}-${range.end}/${rec.size}`,
        'Content-Length': upstream.headers.get('content-length') ?? String(range.end - range.start + 1),
      },
    });
  }
  // No Range asked for (or Storage ignored it): the whole object.
  return new Response(upstream.body, {
    status: 200,
    headers: { ...base, 'Content-Length': upstream.headers.get('content-length') ?? String(rec.size) },
  });
}
