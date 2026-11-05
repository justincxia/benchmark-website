import { PageShell } from '@/components/page-shell';
import { Experiment1Page } from '@/components/experiment-1-page';
import { getDb, getExp1Counts, getExp2Counts } from '@/lib/db';
import { buildMetricRows } from '@/lib/metrics';
import { modelsIn } from '@/lib/models';
import { exampleClips } from '@/lib/examples';

export const dynamic = 'force-dynamic';

export default function Page() {
  const db = getDb();
  const exp1 = getExp1Counts(db);
  const rows = buildMetricRows(exp1, getExp2Counts(db), modelsIn(1));
  return (
    <PageShell>
      <Experiment1Page rows={rows} hasData={Object.keys(exp1).length > 0} examples={exampleClips(1)} />
    </PageShell>
  );
}
