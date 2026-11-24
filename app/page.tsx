import { PageShell } from '@/components/page-shell';
import { IntroPage } from '@/components/intro-page';
import { loadExp2Sentences } from '@/lib/stimuli';

// The ambiguity step uses this Exp 2 sentence. Its two prosodic groupings: reading A (Lisa used
// the telescope) breaks before "with"; reading B (the man has it) breaks before "the man".
const SENTENCE = 'lisa_telescope';
const BREAK_A = 4; // [Lisa saw the man] [with the telescope]
const BREAK_B = 2; // [Lisa saw] [the man with the telescope]

export default function Page() {
  const sentence = loadExp2Sentences().find((s) => s.condition === SENTENCE)!;
  return (
    <PageShell fullBleed>
      <IntroPage sentence={sentence} breakA={BREAK_A} breakB={BREAK_B} />
    </PageShell>
  );
}
