// Client-only Web Audio helpers for the arena's loudness meter: route an <audio> element
// through an AnalyserNode and read how loud it is right now.

type Wired = { source: MediaElementAudioSourceNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> };

/** One context for the page, created on the first play gesture. null = Web Audio unavailable. */
let ctx: AudioContext | null | undefined;
/** An element can be given to createMediaElementSource only once, ever, so remember it. */
const wired = new WeakMap<HTMLMediaElement, Wired>();

/**
 * Routes the element through an analyser (element → analyser → speakers) and returns the
 * analyser, or null when Web Audio is unavailable — the element then plays on its own, as
 * before. Call it from the user's play gesture: it also resumes a suspended context, and once
 * an element is routed it is silent while the context is suspended.
 */
export function attachAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  try {
    if (ctx === undefined) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    }
    if (!ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    let w = wired.get(el);
    if (!w) {
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // about 21 ms at 48 kHz: one frame's worth of sound
      analyser.smoothingTimeConstant = 0;
      w = { source, analyser, buf: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)) };
      wired.set(el, w);
    }
    // connect() is idempotent, so this also restores a graph that detachAnalyser took apart.
    w.source.connect(w.analyser);
    w.analyser.connect(ctx.destination);
    return w.analyser;
  } catch {
    return null;
  }
}

/** Takes the element's graph apart (on unmount) so finished clips don't stay connected. */
export function detachAnalyser(el: HTMLMediaElement): void {
  const w = wired.get(el);
  if (!w) return;
  try {
    w.analyser.disconnect();
  } catch {
    // already disconnected
  }
}

/** Root-mean-square level (0–1) of the sound the element is making right now. */
export function currentRms(el: HTMLMediaElement): number {
  const w = wired.get(el);
  if (!w) return 0;
  w.analyser.getFloatTimeDomainData(w.buf);
  let sum = 0;
  for (let i = 0; i < w.buf.length; i++) sum += w.buf[i] * w.buf[i];
  return Math.sqrt(sum / w.buf.length);
}

/**
 * Bar height (0–1) for a loudness reading, relative to the loudest reading of the clip so far.
 * The floor on the reference keeps near-silence from being stretched to full height; the
 * exponent lifts quiet speech a little so it stays visible next to the peaks.
 */
export function barHeight(rms: number, peak: number): number {
  const ref = Math.max(peak, 0.02);
  return Math.min(1, Math.pow(Math.max(0, rms) / ref, 0.8));
}
