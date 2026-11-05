'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';

const TABS = [
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Experiment 1', href: '/experiment-1' },
  { label: 'Experiment 2', href: '/experiment-2' },
  { label: 'Arena', href: '/arena' },
];

export function SubNav() {
  const { t } = useTheme();
  const pathname = usePathname();

  return (
    <div style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
      <nav className="mx-auto flex max-w-[1240px] items-center gap-[22px] overflow-x-auto px-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`nav-${tab.href.slice(1)}`}
              className="whitespace-nowrap px-0.5 py-[13px] text-[13.5px] font-medium no-underline"
              style={{
                color: active ? t.fg : t.mutedFg,
                borderBottom: `2px solid ${active ? t.fg : 'transparent'}`,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
