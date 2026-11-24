'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import type { Exp2Sentence } from '@/lib/experiments';

const MENU_WIDTH = 340;

/**
 * The dropdown beside the Interpretation accuracy column label: a checkbox per Experiment 2
 * sentence. Only checked sentences count towards accuracy. At least one stays checked.
 */
export function SentenceFilter({
  sentences,
  counted,
  onChange,
}: {
  sentences: Exp2Sentence[];
  /** Conditions of the checked sentences. */
  counted: string[];
  onChange: (counted: string[]) => void;
}) {
  const { t, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const all = counted.length === sentences.length;

  // The table scrolls sideways and would clip a menu placed inside it, so the menu is fixed
  // to the viewport and follows the button.
  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left, width });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const toggle = (condition: string) => {
    const next = counted.includes(condition) ? counted.filter((c) => c !== condition) : [...counted, condition];
    // Keep the survey's sentence order whatever order they were clicked in.
    onChange(sentences.map((s) => s.condition).filter((c) => next.includes(c)));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid="sentence-filter"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
        style={{
          fontFamily: 'inherit',
          background: all ? 'transparent' : t.primary,
          color: all ? t.mutedFg : t.primaryFg,
          border: `1px solid ${all ? t.border : t.primary}`,
        }}
      >
        {all ? 'All sentences' : `${counted.length} of ${sentences.length} sentences`}
        <span className="ml-1" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && pos && (
        <div
          ref={menu}
          data-testid="sentence-menu"
          role="group"
          aria-label="Sentences counted in interpretation accuracy"
          className="info-popup fixed z-30 rounded-[10px] p-2 text-left text-[13px] font-normal leading-[1.45]"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            transformOrigin: 'top right',
            background: t.card,
            color: t.fg,
            border: `1px solid ${t.border}`,
            boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.6)' : '0 12px 32px rgba(0,0,0,0.14)',
          }}
        >
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-xs" style={{ color: t.mutedFg }}>
            <span>Sentences counted in accuracy</span>
            {!all && (
              <button
                type="button"
                data-testid="sentence-all"
                onClick={() => onChange(sentences.map((s) => s.condition))}
                className="cursor-pointer border-0 bg-transparent p-0 text-xs underline"
                style={{ fontFamily: 'inherit', color: t.fg }}
              >
                Check all
              </button>
            )}
          </div>
          {sentences.map((s) => {
            const checked = counted.includes(s.condition);
            const last = checked && counted.length === 1;
            return (
              <label
                key={s.condition}
                className="flex items-start gap-2.5 rounded-md px-2 py-1.5"
                style={{ cursor: last ? 'default' : 'pointer' }}
                title={last ? 'At least one sentence has to stay checked' : undefined}
              >
                <input
                  type="checkbox"
                  data-testid={`sentence-check-${s.condition}`}
                  checked={checked}
                  disabled={last}
                  onChange={() => toggle(s.condition)}
                  className="mt-[3px] flex-shrink-0"
                  style={{ accentColor: t.primary }}
                />
                <span>{s.text}</span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
