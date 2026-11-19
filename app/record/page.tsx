import { PageShell } from '@/components/page-shell';
import { RecordPage } from '@/components/record-page';
import { currentUser } from '@/lib/current-user';
import { buildPrompts } from '@/lib/prompts';
import { loadExp2Sentences } from '@/lib/stimuli';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await currentUser();
  return (
    <PageShell maxWidth="760px">
      <RecordPage signedIn={user !== null} prompts={user ? buildPrompts(loadExp2Sentences()) : []} />
    </PageShell>
  );
}
