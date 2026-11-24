import { NextResponse } from 'next/server';
import { completeSonaSession, getSonaContact, getSonaSession } from '@/lib/db';
import { completionRedirectUrl, isUuid, sameContact, validateContact } from '@/lib/sona';
import { readJsonCapped } from '@/lib/sona-request';

// Finishes a SONA session: stores the contact (in sona_contacts, apart from the answers) and
// sets completed_at, only once every trial of the session's block has an answer.
//
// A repeat call for a completed session is idempotent when it carries the same contact (200
// {ok, duplicate: true}: the client may retry after a lost response) and 409 otherwise.
export async function POST(request: Request) {
  const parsed = await readJsonCapped(request);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const contact = validateContact(body);
  if ('error' in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  const sessionId = (body as Record<string, unknown>).sessionId;
  if (!isUuid(sessionId)) return NextResponse.json({ error: 'no such session' }, { status: 404 });

  try {
    const result = await completeSonaSession(sessionId, contact.value);
    // The SONA credit link is revealed only here, after completion, built from the stored
    // (normalised) SONA id, so it is never in the page for someone to use without finishing.
    const redirect = async () =>
      completionRedirectUrl(process.env.SONA_COMPLETION_URL, (await getSonaSession(sessionId))?.sonaId);
    if (result === 'ok') return NextResponse.json({ ok: true, redirect: await redirect() }, { status: 200 });
    if (result === 'not_found') return NextResponse.json({ error: 'no such session' }, { status: 404 });
    if (result === 'incomplete') return NextResponse.json({ error: 'not every trial has been answered' }, { status: 409 });
    const stored = await getSonaContact(sessionId);
    if (stored && sameContact(stored, contact.value))
      return NextResponse.json({ ok: true, duplicate: true, redirect: await redirect() }, { status: 200 });
    return NextResponse.json({ error: 'session already completed' }, { status: 409 });
  } catch {
    return NextResponse.json({ error: 'could not complete the session' }, { status: 500 });
  }
}
