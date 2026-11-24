import { NextResponse } from 'next/server';
import { getSonaSession, insertSonaResponse } from '@/lib/db';
import { getManifest } from '@/lib/clip-manifest';
import { MAX_MS, validateResponseInput } from '@/lib/response-input';
import { checkTrialClip, isUuid } from '@/lib/sona';
import { readJsonCapped } from '@/lib/sona-request';

// One SONA answer. Writes only to sona_responses (never the arena's `responses`).
export async function POST(request: Request) {
  const parsed = await readJsonCapped(request);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 });
  const b = body as Record<string, unknown>;

  if (!isUuid(b.sessionId)) return NextResponse.json({ error: 'no such session' }, { status: 404 });
  let session;
  try {
    session = await getSonaSession(b.sessionId);
  } catch {
    return NextResponse.json({ error: 'could not load the session' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'no such session' }, { status: 404 });
  if (session.completedAt) return NextResponse.json({ error: 'session already completed' }, { status: 409 });

  const mismatch = checkTrialClip(session.block, b.trialIndex, b.clip);
  if (mismatch) return NextResponse.json({ error: mismatch }, { status: 400 });

  const rms = b.responseMs;
  if (typeof rms !== 'number' || !Number.isInteger(rms) || rms < 0 || rms > MAX_MS)
    return NextResponse.json({ error: 'responseMs must be a non-negative integer' }, { status: 400 });

  let clips;
  try {
    clips = getManifest();
  } catch {
    return NextResponse.json({ error: 'stimuli unavailable' }, { status: 503 });
  }
  // The arena's validator, unchanged: the session and trial index stand in for its
  // participant/session/round, which the SONA table doesn't have.
  const result = validateResponseInput(
    {
      participant: 'sona',
      session: session.id,
      round: b.trialIndex,
      clip: b.clip,
      naturalness: b.naturalness,
      humanOrAi: b.humanOrAi,
      questionAnswered: b.questionAnswered,
      interpretation: b.interpretation,
      listenedMs: b.listenedMs,
    },
    clips,
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const { participant: _p, session: _s, round: _r, ...answer } = result.value;

  let inserted: boolean;
  try {
    inserted = await insertSonaResponse({ ...answer, sessionId: session.id, trialIndex: b.trialIndex as number, responseMs: rms });
  } catch {
    return NextResponse.json({ error: 'could not save response' }, { status: 500 });
  }
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
