import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { SonaSurveyPage } from '@/components/sona-survey-page';
import { audioDir, getManifest } from '@/lib/clip-manifest';
import { estimateMinutes } from '@/lib/sona';
import { sonaMinutes } from '@/lib/sona-duration';
import type { ClipInfo } from '@/lib/clips';

// Reads AUDIO_DIR and SONA_COMPLETION_URL at request time.
export const dynamic = 'force-dynamic';

// Hidden: reached only by the link posted on SONA. Nothing on the site links here, and
// next.config.ts adds an `X-Robots-Tag: noindex` header as well.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  let clips: ClipInfo[] = [];
  let manifestError: string | null = null;
  let minutes = estimateMinutes([]);
  try {
    const manifest = getManifest();
    minutes = sonaMinutes(audioDir(), manifest);
    // The on-disk path stays on the server; the client names clips by basename only.
    clips = manifest.map(({ relPath: _relPath, ...c }) => c);
  } catch (e) {
    manifestError = e instanceof Error ? e.message : 'Stimuli unavailable';
  }
  return (
    <PageShell maxWidth="640px" compact hideSubNav>
      <SonaSurveyPage
        clips={clips}
        manifestError={manifestError}
        minutes={minutes}
        completionUrl={process.env.SONA_COMPLETION_URL || null}
      />
    </PageShell>
  );
}
