// Body reading for the SONA API routes, which take requests from anyone (no sign-in): the JSON
// body is capped so a client cannot make the server buffer an arbitrarily large payload.

/** Every SONA request body is a few hundred bytes; 16 KB leaves ample room. */
export const MAX_SONA_BODY_BYTES = 16 * 1024;

export async function readJsonCapped(
  request: Request,
  cap = MAX_SONA_BODY_BYTES
): Promise<{ value: unknown } | { error: string; status: number }> {
  const tooLarge = { error: `body too large (max ${cap} bytes)`, status: 413 };
  if (Number(request.headers.get('content-length') ?? '0') > cap) return tooLarge;
  if (!request.body) return { error: 'body must be valid JSON', status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { error: 'body must be valid JSON', status: 400 };
  }
}
