'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import { Grid, type Art, type Avoid } from '@/lib/intro-art';

/** IBM Plex Mono advances exactly 0.6em per character. */
const ADVANCE = 0.6;
const LINE = 1.2;
const FPS = 24;
/** Opacity of the dim / mid / bright layers: low contrast, so foreground text stays readable. */
const OPACITY = [0.09, 0.22, 0.45];
/** The frame shown when motion is reduced. */
const STATIC_T = 1.9;

/**
 * Renders one text-art background as three stacked <pre> layers (one per brightness level),
 * sized to fill its container. Animates only while `running` and the tab is visible; with
 * `reduced`, draws a single static frame. With `at`, it is drawn at that value and never on
 * a timer.
 */
export function TextArt({
  art,
  running,
  reduced,
  testId,
  avoid = null,
  at = null,
}: {
  art: Art;
  running: boolean;
  reduced: boolean;
  testId: string;
  /** A band (px from the top of this box) the art should keep clear, if the art supports it. */
  avoid?: Avoid | null;
  /** If set, the art is drawn at this value instead of running on the clock: it changes only
   *  when the value does (the focus art passes scroll progress). */
  at?: number | null;
}) {
  const { t } = useTheme();
  const driven = at !== null;
  const box = useRef<HTMLDivElement | null>(null);
  const pres = useRef<(HTMLPreElement | null)[]>([]);
  const size = useRef<{ cols: number; rows: number; font: number; avoid?: Avoid }>({ cols: 0, rows: 0, font: 12 });
  const clock = useRef(0);
  const drawRef = useRef<(time: number) => void>(() => {});
  const atRef = useRef<number | null>(at);

  useEffect(() => {
    drawRef.current = (time: number) => {
      const { cols, rows, avoid: rowsAvoid } = size.current;
      if (cols <= 0 || rows <= 0) return;
      const g = new Grid(cols, rows);
      art.draw(g, time, rowsAvoid);
      const layers = g.layers();
      layers.forEach((s, i) => {
        const el = pres.current[i];
        if (el && el.textContent !== s) el.textContent = s;
      });
    };
  }, [art]);

  // Driven from outside (no clock): redraw when the value changes.
  useEffect(() => {
    atRef.current = at;
    if (at !== null) drawRef.current(at);
  }, [at, art]);

  // Measure and re-grid on resize.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const font = art.fontSize(w, h, avoid ?? undefined);
      const line = font * LINE;
      size.current = {
        cols: Math.floor(w / (font * ADVANCE)),
        rows: Math.floor(h / line),
        font,
        avoid: avoid
          ? {
              top: Math.floor(avoid.top / line),
              bottom: Math.ceil(avoid.bottom / line),
              end: avoid.end === undefined ? undefined : Math.floor(avoid.end / line),
            }
          : undefined,
      };
      for (const p of pres.current) {
        if (!p) continue;
        p.style.fontSize = `${font}px`;
        p.style.lineHeight = `${font * LINE}px`;
      }
      drawRef.current(atRef.current ?? (reduced ? STATIC_T : clock.current));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [art, reduced, avoid]);

  // Animation loop, throttled, paused when not running or the tab is hidden.
  useEffect(() => {
    if (reduced || !running || driven) return;
    let frame = 0;
    let last = 0;
    let base = performance.now() - clock.current * 1000;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      clock.current = (now - base) / 1000;
      drawRef.current(clock.current);
    };
    const onVisibility = () => {
      // Resume where it stopped instead of jumping ahead by the hidden time.
      if (!document.hidden) base = performance.now() - clock.current * 1000;
    };
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, reduced, driven]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" aria-hidden="true" data-testid={testId}>
      {OPACITY.map((o, i) => (
        <pre
          key={i}
          ref={(el) => {
            pres.current[i] = el;
          }}
          className="absolute inset-0 m-0 overflow-hidden whitespace-pre"
          style={{ fontFamily: MONO, color: t.fg, opacity: o, letterSpacing: 0, userSelect: 'none' }}
        />
      ))}
    </div>
  );
}
