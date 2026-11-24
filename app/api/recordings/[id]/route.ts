import { NextResponse, type NextRequest } from 'next/server';
import { deleteRecording, getRecording } from '@/lib/db';
import { requestUser } from '@/lib/request-user';
import { removeRecordingFile } from '@/lib/recordings-store';

/** Deletes one of the signed-in user's recordings: the row and the file. Anyone else's → 404. */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const id = Number((await ctx.params).id);
  const rec = Number.isInteger(id) ? await getRecording(id, user.id) : null;
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await deleteRecording(rec.id, user.id);
  removeRecordingFile(rec.path);
  return NextResponse.json({ ok: true });
}
