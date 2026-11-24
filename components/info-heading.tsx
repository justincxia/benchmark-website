'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import { InfoIcon } from '@/components/icons';

/** How long the popup takes to fade out before it is removed (matches globals.css). */
const CLOSE_MS = 120;

/**
 * A heading with a small (i) button beside it. Clicking the button opens the description
 * (`children`) in a popup that floats over the page below the heading, without moving
 * anything. It closes on a second click, a click anywhere else, or Escape.
 */
export function InfoHeading({
  id,
  title,
  level = 'h2',
  children,
}: {
  /** Used for the test ids and to tie the button to its popup. */
  id: string;
  title: string;
  level?: 'h1' | 'h2';
  children: ReactNode;
}) {
  const { t, isDark } = useTheme();
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const root = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Heading = level;
  const panelId = `info-panel-${id}`;
  const open = state === 'open';

  const close = useCallback(() => {
    setState((s) => (s === 'open' ? 'closing' : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => (s === 'closing' ? 'closed' : s)), CLOSE_MS);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={root} className="relative mb-4">
      <div className="flex items-center gap-2">
        <Heading
          className={level === 'h1' ? 'text-2xl font-semibold tracking-tight' : 'text-[19px] font-semibold tracking-tight'}
          style={{ margin: 0 }}
        >
          {title}
        </Heading>
        <button
          type="button"
          data-testid={`info-${id}`}
          aria-label={`About ${title}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setState('open'))}
          className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0"
          style={{ background: open ? t.muted : 'transparent', color: open ? t.fg : t.mutedFg }}
        >
          <InfoIcon />
        </button>
      </div>
      {state !== 'closed' && (
        <div
          id={panelId}
          data-testid={panelId}
          data-state={state}
          role="dialog"
          aria-label={`About ${title}`}
          className="info-popup absolute left-0 top-full z-30 mt-2 overflow-y-auto rounded-[10px] px-[18px] py-3.5 text-[13.5px] leading-[1.6]"
          style={{
            width: 'min(560px, calc(100vw - 48px))',
            maxHeight: 'min(70vh, 520px)',
            background: t.card,
            border: `1px solid ${t.border}`,
            color: t.mutedFg,
            boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.6)' : '0 12px 32px rgba(0,0,0,0.14)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
