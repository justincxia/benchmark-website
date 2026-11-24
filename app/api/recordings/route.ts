import { NextResponse, type NextRequest } from 'next/server';
import { insertRecording } from '@/lib/db';
import { requestUser } from '@/lib/request-user';
import { buildPrompts } from '@/lib/prompts';
import { loadExp2Sentences } from '@/lib/stimuli';
import { MAX_RECORDING_BYTES, validateRecordingUpload } from '@/lib/recording-input';
import { removeRecordingFile, saveRecordingFile } from '@/lib/recordings-store';

/** Reads at most `cap` + 1 bytes, so an oversized body is rejected without buffering it all. */
async function readCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// Upload one Record-tab take: raw audio body, prompt id in ?prompt=.
export async function POST(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_RECORDING_BYTES) return NextResponse.json({ error: 'recording too large (max 5 MB)' }, { status: 413 });
  const bytes = await readCapped(request, MAX_RECORDING_BYTES);
  const size = bytes ? bytes.byteLength : MAX_RECORDING_BYTES + 1;

  const result = validateRecordingUpload(
    { promptId: request.nextUrl.searchParams.get('prompt'), contentType: request.headers.get('content-type'), size },
    buildPrompts(loadExp2Sentences())
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { prompt, mime } = result.value;
  const rel = saveRecordingFile(user.id, mime, bytes!);
  try {
    const id = await insertRecording({
      userId: user.id,
      experiment: prompt.experiment,
      promptId: prompt.id,
      mime,
      path: rel,
      size,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch {
    removeRecordingFile(rel);
    return NextResponse.json({ error: 'could not save recording' }, { status: 500 });
  }
}
