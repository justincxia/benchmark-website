import { PageShell } from '@/components/page-shell';
import { Experiment2Page } from '@/components/experiment-2-page';
import { getDb, getExp1Counts, getExp2Counts } from '@/lib/db';
import { buildMetricRows } from '@/lib/metrics';
import { modelsIn } from '@/lib/models';
import { exampleClips } from '@/lib/examples';
import { loadExp2Sentences } from '@/lib/stimuli';

export const dynamic = 'force-dynamic';

export default function Page() {
  const db = getDb();
  const rows = buildMetricRows(getExp1Counts(db), getExp2Counts(db), modelsIn(2));
  return (
    <PageShell>
      <Experiment2Page rows={rows} sentences={loadExp2Sentences()} examples={exampleClips(2)} />
    </PageShell>
  );
}
