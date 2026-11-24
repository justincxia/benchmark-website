import { PageShell } from '@/components/page-shell';
import { LeaderboardPage } from '@/components/leaderboard-page';
import { WaveBackground } from '@/components/wave-background';
import { getExp1Counts, getExp2Counts, getExp2InterpBySentence } from '@/lib/db';
import { buildMetricRows, type View } from '@/lib/metrics';
import { loadListenerResults } from '@/lib/perception';
import { modelsIn } from '@/lib/models';
import { exampleClips } from '@/lib/examples';
import { loadExp2Sentences } from '@/lib/stimuli';

// Reads the survey tables on every request, so a re-seed shows up on reload.
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [exp1, exp2] = await Promise.all([getExp1Counts(), getExp2Counts()]);

  // ?exp=1, ?exp=2 or ?exp=listeners picks the view. Without it, open on the first experiment that has results.
  const asked = (await searchParams).exp;
  const experiment: View =
    asked === 'listeners'
      ? 'listeners'
      : asked === '1'
        ? 1
        : asked === '2'
          ? 2
          : Object.keys(exp1).length > 0 || Object.keys(exp2).length === 0
            ? 1
            : 2;
  const listeners = experiment === 'listeners' ? loadListenerResults() : null;
  const interpBySentence = experiment === 2 ? await getExp2InterpBySentence() : {};

  return (
    <PageShell background={<WaveBackground />}>
      <LeaderboardPage
        experiment={experiment}
        rows={listeners ? listeners.rows : buildMetricRows(exp1, exp2, modelsIn(experiment as 1 | 2))}
        listenerCounts={listeners?.counts}
        interpBySentence={interpBySentence}
        sentences={loadExp2Sentences()}
        examples={listeners ? [] : exampleClips(experiment as 1 | 2)}
      />
    </PageShell>
  );
}
