import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { getDb, getRecording } from '@/lib/db';
import { requestUser } from '@/lib/request-user';
import { recordingPath } from '@/lib/recordings-store';

export const dynamic = 'force-dynamic';

/** Streams a recording, only to the user who made it. Signed out or someone else's → 404. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = requestUser(request);
  const id = Number((await ctx.params).id);
  const rec = user && Number.isInteger(id) ? getRecording(getDb(), id, user.id) : null;
  if (!rec) return new Response('Not found', { status: 404 });
  const full = recordingPath(rec.path);
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': rec.mime, 'Content-Length': String(size), 'Cache-Control': 'private, no-store' },
  });
}
