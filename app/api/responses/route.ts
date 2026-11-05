import { NextResponse } from 'next/server';
import { getDb, insertResponse } from '@/lib/db';
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
  try {
    insertResponse(getDb(), result.value);
  } catch {
    return NextResponse.json({ error: 'could not save response' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
