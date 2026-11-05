import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SubNav } from '@/components/sub-nav';

export function PageShell({
  children,
  maxWidth = '1240px',
  isHome = false,
}: {
  children: ReactNode;
  maxWidth?: string;
  isHome?: boolean;
}) {
  return (
    <>
      <SiteHeader isHome={isHome} />
      <SubNav />
      <main className="mx-auto px-6 pt-10 pb-[88px]" style={{ maxWidth }}>
        {children}
      </main>
    </>
  );
}
