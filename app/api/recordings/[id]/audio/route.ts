import type { NextRequest } from 'next/server';
import { getRecording } from '@/lib/db';
import { requestUser } from '@/lib/request-user';
import { recordingAudioResponse } from '@/lib/recordings-store';

export const dynamic = 'force-dynamic';

/** Streams a recording from Storage, only to the user who made it (Range supported). Signed out
 *  or someone else's → 404, and ownership is settled before Storage is touched. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  const id = Number((await ctx.params).id);
  const rec = user && Number.isInteger(id) ? await getRecording(id, user.id) : null;
  if (!rec) return new Response('Not found', { status: 404 });
  return recordingAudioResponse(rec, request.headers.get('range'));
}
