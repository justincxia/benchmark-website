import { NextResponse } from 'next/server';
import { insertResponse } from '@/lib/db';
import { getManifest } from '@/lib/clip-manifest';
import { validateResponseInput } from '@/lib/response-input';

// Writes only to `responses`. The leaderboard and experiment pages read the seeded survey
// tables and never this one, so arena traffic cannot move a published number.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 });
  }
  let clips;
  try {
    clips = getManifest();
  } catch {
    return NextResponse.json({ error: 'stimuli unavailable' }, { status: 503 });
  }

  const result = validateResponseInput(body, clips);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  let inserted: boolean;
  try {
    inserted = await insertResponse(result.value);
  } catch {
    return NextResponse.json({ error: 'could not save response' }, { status: 500 });
  }
  // A repeat of an already-recorded round (e.g. resubmitted after a reload) is not an error:
  // the round is recorded, just not twice.
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
