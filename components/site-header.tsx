'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';

export function SiteHeader({ isHome = false }: { isHome?: boolean }) {
  const { isDark, setIsDark, t } = useTheme();

  const lightTab = {
    background: !isDark ? t.card : 'transparent',
    color: !isDark ? t.fg : t.mutedFg,
    boxShadow: !isDark ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
  };
  const darkTab = {
    background: isDark ? t.card : 'transparent',
    color: isDark ? t.fg : t.mutedFg,
    boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
  };

  const name = <span className="text-sm font-semibold tracking-tight">Prosody Bench</span>;

  return (
    <header className="sticky top-0 z-20" style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-6">
        {isHome ? (
          <div className="flex items-center gap-2" style={{ color: t.fg }} data-testid="site-name">
            {name}
          </div>
        ) : (
          <Link href="/leaderboard" className="flex items-center gap-2 no-underline" style={{ color: t.fg }} data-testid="site-name">
            {name}
          </Link>
        )}

        <div className="ml-auto flex items-center gap-0.5 rounded-lg p-[3px]" style={{ background: t.muted }}>
          <button
            onClick={() => setIsDark(false)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
            style={lightTab}
          >
            Light
          </button>
          <button
            onClick={() => setIsDark(true)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
            style={darkTab}
          >
            Dark
          </button>
        </div>
      </div>
    </header>
  );
}
