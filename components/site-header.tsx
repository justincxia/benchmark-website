'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { CogIcon, UserIcon } from '@/components/icons';

/** Height of the strip the floating controls sit in; pages leave this much room at the top. */
export const SITE_HEADER_HEIGHT = 56;

/** No header bar: the site name, the account link and the cog float over the page as three
 *  separate soft-cornered pills, fixed to the top corners. The page shows through between them. */
export function SiteHeader() {
  const { isDark, t } = useTheme();
  const pill = 'pointer-events-auto flex h-9 items-center justify-center rounded-lg';
  const pillStyle = {
    background: t.card,
    border: `1px solid ${t.border}`,
    boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.08)',
  };

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center gap-2 px-4"
      style={{ height: SITE_HEADER_HEIGHT }}
    >
      <Link
        href="/"
        className={`${pill} px-3 text-sm font-semibold tracking-tight no-underline`}
        style={{ ...pillStyle, color: t.fg }}
        data-testid="site-name"
      >
        Prosody Bench
      </Link>

      <Link
        href="/account"
        aria-label="Account"
        title="Account"
        data-testid="header-account"
        className={`${pill} ml-auto w-9`}
        style={{ ...pillStyle, color: t.mutedFg }}
      >
        <UserIcon />
      </Link>
      <PreferencesMenu buttonClass={`${pill} w-9`} buttonStyle={pillStyle} />
    </header>
  );
}

/** The segmented Light/Dark switcher, styled as the reference's site-header toggle. */
function ThemeSwitch() {
  const { isDark, setIsDark, t } = useTheme();
  const tab = (active: boolean) => ({
    background: active ? t.card : 'transparent',
    color: active ? t.fg : t.mutedFg,
    boxShadow: active ? (isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)') : 'none',
  });
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-[3px]" style={{ background: t.muted }} role="group" aria-label="Theme">
      <button
        type="button"
        data-testid="theme-light"
        aria-pressed={!isDark}
        onClick={() => setIsDark(false)}
        className="cursor-pointer rounded-md border-0 px-3 py-1.5 text-[12.5px] font-semibold"
        style={{ ...tab(!isDark), fontFamily: 'inherit' }}
      >
        Light
      </button>
      <button
        type="button"
        data-testid="theme-dark"
        aria-pressed={isDark}
        onClick={() => setIsDark(true)}
        className="cursor-pointer rounded-md border-0 px-3 py-1.5 text-[12.5px] font-semibold"
        style={{ ...tab(isDark), fontFamily: 'inherit' }}
      >
        Dark
      </button>
    </div>
  );
}

/** Preference rows shown in the cog menu. Add a row here to add a preference. */
const PREFERENCES: { id: string; label: string; control: () => ReactNode }[] = [
  { id: 'theme', label: 'Theme', control: () => <ThemeSwitch /> },
];

/** The cog: a preferences dropdown. Changing a setting keeps it open; outside click and
 *  Escape close it. This is the only place the theme is changed. */
function PreferencesMenu({ buttonClass, buttonStyle }: { buttonClass: string; buttonStyle: CSSProperties }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pointer-events-auto relative" ref={ref}>
      <button
        type="button"
        aria-label="Preferences"
        title="Preferences"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="header-settings"
        onClick={() => setOpen((o) => !o)}
        className={`${buttonClass} cursor-pointer`}
        style={{ ...buttonStyle, color: t.mutedFg, ...(open ? { background: t.muted } : null) }}
      >
        <CogIcon />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Preferences"
          data-testid="preferences-menu"
          className="absolute right-0 mt-1.5 rounded-lg p-1.5"
          style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
        >
          <ul className="m-0 list-none p-0">
            {PREFERENCES.map((p) => (
              <li
                key={p.id}
                data-testid={`pref-${p.id}`}
                className="flex items-center justify-between gap-6 px-2 py-1.5 text-[13px] font-medium"
                style={{ color: t.fg }}
              >
                <span>{p.label}</span>
                {p.control()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
