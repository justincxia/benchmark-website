import { PageShell } from '@/components/page-shell';
import { LeaderboardPage } from '@/components/leaderboard-page';
import { getDb, getExp1Counts, getExp2Counts } from '@/lib/db';
import { buildMetricRows } from '@/lib/metrics';

// Reads the survey tables on every request, so a re-seed shows up on reload.
export const dynamic = 'force-dynamic';

export default function Page() {
  const db = getDb();
  const rows = buildMetricRows(getExp1Counts(db), getExp2Counts(db));
  return (
    <PageShell isHome>
      <LeaderboardPage rows={rows} />
    </PageShell>
  );
}
