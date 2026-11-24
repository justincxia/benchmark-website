import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSonaSession } from '@/lib/db';
import { getManifest } from '@/lib/clip-manifest';
import { buildBlock, seeded } from '@/lib/clips';
import { normalizeSonaId, SONA_DEBUG_TRIALS, SONA_TRIALS } from '@/lib/sona';
import { readJsonCapped } from '@/lib/sona-request';

// Called once, when a participant agrees to the consent form. Writes only to sona_sessions.
export async function POST(request: Request) {
  const parsed = await readJsonCapped(request);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 });
  const b = body as Record<string, unknown>;

  let block: string[];
  try {
    // seeded(0) is constant, so the seed is drawn from [1, 2^31 - 1).
    const seed = randomInt(1, 2147483647);
    block = buildBlock(getManifest(), 1, seeded(seed)).map((c) => c.file);
    if (block.length !== SONA_TRIALS) {
      return NextResponse.json({ error: `stimuli incomplete: ${block.length} of ${SONA_TRIALS} clips` }, { status: 503 });
    }
    // A debug session (never in production) keeps the first few clips of a full, valid block.
    const debug = b.debug === true && process.env.NODE_ENV !== 'production';
    if (debug) block = block.slice(0, SONA_DEBUG_TRIALS);
    const userAgent = request.headers.get('user-agent')?.slice(0, 1000) || null;
    const sessionId = await createSonaSession({ seed, block, sonaId: normalizeSonaId(b.sonaId), userAgent, debug });
    return NextResponse.json({ sessionId, block, debug }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'could not start a session' }, { status: 503 });
  }
}
