import type { ReactNode } from 'react';
import { SITE_HEADER_HEIGHT, SiteHeader } from '@/components/site-header';
import { SubNav } from '@/components/sub-nav';
import { SiteFooter } from '@/components/site-footer';

export function PageShell({
  children,
  maxWidth = '1240px',
  fullBleed = false,
  compact = false,
  background,
  hideSubNav = false,
}: {
  children: ReactNode;
  maxWidth?: string;
  /** No max width or padding: the page lays itself out edge to edge (the intro page). */
  fullBleed?: boolean;
  /** Less space above the content, for a page that must fit one screen (the arena). */
  compact?: boolean;
  /** Decoration fixed behind the whole page. The page's content is drawn over it, so it
   *  shows only where nothing opaque covers it. */
  background?: ReactNode;
  /** Leave out the sub-nav (Leaderboard / Arena / Record): a page reached only by direct link
   *  that should not lead elsewhere (the SONA survey). The header and footer stay. */
  hideSubNav?: boolean;
}) {
  const content = (
    <>
      {!hideSubNav && <SubNav />}
      {fullBleed ? (
        <main className="flex-1">{children}</main>
      ) : (
        <main className={`mx-auto w-full flex-1 px-6 pb-[88px] ${compact ? 'pt-5' : 'pt-10'}`} style={{ maxWidth }}>
          {children}
        </main>
      )}
      <SiteFooter />
    </>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* The controls float over the page; this keeps the sub-nav clear of them at the top. */}
      <div style={{ height: SITE_HEADER_HEIGHT }} aria-hidden="true" />
      {background ? (
        <>
          <div className="pointer-events-none fixed inset-0 z-0">{background}</div>
          <div className="relative z-[1] flex flex-1 flex-col">{content}</div>
        </>
      ) : (
        content
      )}
    </div>
  );
}
