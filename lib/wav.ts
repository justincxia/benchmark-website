// WAV header parsing and a tiny tone writer. Pure (bytes in, numbers out; no Node builtins), so
// both the server (consent-screen time estimate) and the browser (the volume-check fallback
// tone) can use it.

function ascii(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

/**
 * The duration in seconds of a RIFF/WAVE file, from its header alone: walks the chunks to
 * `fmt ` (for the byte rate) and `data` (for its size). `bytes` need only hold the start of the
 * file up to the `data` chunk's header. `fileSize`, when given, caps the data size and stands in
 * for a streaming writer's placeholder size (0 or 0xFFFFFFFF). Returns null for anything that is
 * not a parseable WAV.
 */
export function wavDurationSec(bytes: Uint8Array, fileSize?: number): number | null {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | null = null;
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = ascii(bytes, off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      if (body + 16 > bytes.length) return null;
      byteRate = view.getUint32(body + 8, true);
    } else if (id === 'data') {
      if (!byteRate) return null;
      let dataSize = size;
      if (fileSize !== undefined) {
        const rest = Math.max(0, fileSize - body);
        if (dataSize === 0 || dataSize === 0xffffffff || dataSize > rest) dataSize = rest;
      }
      return dataSize / byteRate;
    }
    // Chunks are word-aligned: an odd size is followed by one pad byte.
    off = body + size + (size % 2);
  }
  return null;
}

/** A mono 16-bit PCM WAV of a sine tone with short fades, as bytes. */
export function toneWav(seconds = 1, freq = 440, rate = 16000, amp = 0.3): Uint8Array {
  const n = Math.round(rate * seconds);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const put = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i);
  };
  put(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, 'data');
  v.setUint32(40, n * 2, true);
  const fade = Math.round(rate * 0.02);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * env * 32767), true);
  }
  return out;
}
