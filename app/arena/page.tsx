import { PageShell } from '@/components/page-shell';
import { ArenaPage } from '@/components/arena-page';
import { getManifest } from '@/lib/clip-manifest';
import { loadExp2Sentences } from '@/lib/stimuli';
import type { ClipInfo } from '@/lib/clips';

// Reads AUDIO_DIR at request time.
export const dynamic = 'force-dynamic';

export default function Page() {
  let clips: ClipInfo[] = [];
  let manifestError: string | null = null;
  try {
    // The on-disk path stays on the server; the client names clips by basename only.
    clips = getManifest().map(({ relPath: _relPath, ...c }) => c);
  } catch (e) {
    manifestError = e instanceof Error ? e.message : 'Stimuli unavailable';
  }
  return (
    <PageShell maxWidth="640px">
      <ArenaPage clips={clips} sentences={loadExp2Sentences()} manifestError={manifestError} />
    </PageShell>
  );
}
