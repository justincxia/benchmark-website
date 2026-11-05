'use client';

import { useTheme } from '@/lib/theme';
import type { MetricRow } from '@/lib/metrics';
import {
  INTERPRETATION_PROMPT,
  NATURALNESS_OPTIONS,
  NATURALNESS_PROMPT,
  type Exp2Sentence,
} from '@/lib/experiments';
import { MetricTable } from '@/components/metric-table';
import { ExampleClips, type ExampleClip } from '@/components/example-clips';

export function Experiment2Page({
  rows,
  sentences,
  examples,
}: {
  rows: MetricRow[];
  sentences: Exp2Sentence[];
  examples: ExampleClip[];
}) {
  const { t } = useTheme();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Experiment 2: Ambiguity
      </h1>
      <div className="max-w-[720px] text-[13.5px] leading-[1.6]" style={{ color: t.mutedFg }}>
        <p style={{ margin: '0 0 10px' }}>
          A human perception survey on syntactic ambiguity. Five ambiguous sentences, each with two
          interpretations, A and B. Before each sentence&apos;s recordings, listeners were shown the sentence and its
          two interpretations.
        </p>
        <p style={{ margin: '0 0 6px' }}>After each recording, they answered two required questions, in this order:</p>
        <ol className="pl-5" style={{ margin: '0 0 10px' }}>
          <li>{INTERPRETATION_PROMPT} A / B.</li>
          <li>
            {NATURALNESS_PROMPT} {NATURALNESS_OPTIONS[0]} … {NATURALNESS_OPTIONS[4]}.
          </li>
        </ol>
        <p style={{ margin: 0 }}>
          There was no human-or-AI question. Interpretation accuracy is the share of trials where the chosen
          interpretation is the one the recording was made to convey. Attention-check trials are excluded.
        </p>
      </div>

      <div
        className="mt-6 overflow-hidden rounded-[10px]"
        style={{ background: t.card, border: `1px solid ${t.border}` }}
        data-testid="exp2-sentences"
      >
        {sentences.map((s) => (
          <div key={s.condition} className="px-[22px] py-3.5 text-[13px] leading-[1.55]" style={{ borderBottom: `1px solid ${t.border}` }}>
            <div className="mb-1 text-sm font-semibold">{s.text}</div>
            <div style={{ color: t.mutedFg }}>A: {s.optionA}</div>
            <div style={{ color: t.mutedFg }}>B: {s.optionB}</div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Results</h2>
        <MetricTable rows={rows} columns={['exp2Interp', 'exp2Nat']} testId="exp2" />
      </section>

      <ExampleClips
        clips={examples}
        caption={`“${sentences[0]?.text ?? ''}”, interpretation A, take 1, for each model.`}
      />
    </>
  );
}
