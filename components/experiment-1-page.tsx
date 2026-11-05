'use client';

import { useTheme } from '@/lib/theme';
import type { MetricRow } from '@/lib/metrics';
import {
  EXP1_CONDITIONS,
  EXP1_SENTENCE,
  HUMAN_AI_OPTIONS,
  HUMAN_AI_PROMPT,
  INTENDED_QUESTION,
  NATURALNESS_OPTIONS,
  NATURALNESS_PROMPT,
  QUESTION_PROMPT,
} from '@/lib/experiments';
import { MetricTable } from '@/components/metric-table';
import { ExampleClips, type ExampleClip } from '@/components/example-clips';

export function Experiment1Page({
  rows,
  hasData,
  examples,
}: {
  rows: MetricRow[];
  hasData: boolean;
  examples: ExampleClip[];
}) {
  const { t } = useTheme();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Experiment 1: Focus
      </h1>
      <div className="max-w-[720px] text-[13.5px] leading-[1.6]" style={{ color: t.mutedFg }}>
        <p style={{ margin: '0 0 10px' }}>
          A human perception survey on prosodic focus. Every model said the sentence &ldquo;{EXP1_SENTENCE}&rdquo; in
          five focus conditions ({EXP1_CONDITIONS.join(', ')}), with five takes per model per condition.
        </p>
        <p style={{ margin: '0 0 6px' }}>After each recording, listeners answered three required questions, in this order:</p>
        <ol className="mb-2.5 pl-5" style={{ margin: '0 0 10px' }}>
          <li>
            {NATURALNESS_PROMPT} {NATURALNESS_OPTIONS[0]} … {NATURALNESS_OPTIONS[4]}.
          </li>
          <li>
            {HUMAN_AI_PROMPT} {HUMAN_AI_OPTIONS.join(' / ')}.
          </li>
          <li>
            {QUESTION_PROMPT}{' '}
            {(['molly', 'mailed', 'a', 'melon', 'broad'] as const).map((c, i) => (
              <span key={c}>
                {i > 0 && ', '}&ldquo;{INTENDED_QUESTION[c]}&rdquo; ({c})
              </span>
            ))}
            .
          </li>
        </ol>
        <p style={{ margin: 0 }}>
          Focus accuracy is the share of trials where the chosen question is the one the condition answers.
          Attention-check trials are excluded.
          {!hasData && ' This data has not been collected yet, so the results below show —.'}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Results</h2>
        <MetricTable rows={rows} columns={['exp1Focus', 'exp1Nat', 'exp1Human']} testId="exp1" />
      </section>

      <ExampleClips clips={examples} caption="Take 1 of the broad condition for each model." />
    </>
  );
}
