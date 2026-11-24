'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme';

export function SiteFooter() {
  const { t } = useTheme();
  return (
    <footer style={{ borderTop: `1px solid ${t.border}` }}>
      <div className="mx-auto max-w-[1240px] px-6 py-5 text-center text-[12.5px]" style={{ color: t.mutedFg }} data-testid="footer-text">
        Made by Penn Phonetics Lab -{' '}
        <Link href="/privacy" data-testid="footer-privacy" className="underline" style={{ color: t.mutedFg }}>
          Privacy policy
        </Link>
      </div>
    </footer>
  );
}
