'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { hasData, metricsFor, withInterpSentences, type MetricRow, type View } from '@/lib/metrics';
import type { ListenerResults } from '@/lib/perception';
import type { Exp2InterpBySentence } from '@/lib/db';
import { SentenceFilter } from '@/components/sentence-filter';
import {
  EXP1_CONDITIONS,
  EXP1_SENTENCE,
  HUMAN_AI_OPTIONS,
  HUMAN_AI_PROMPT,
  INTENDED_QUESTION,
  INTERPRETATION_PROMPT,
  NATURALNESS_OPTIONS,
  NATURALNESS_PROMPT,
  QUESTION_PROMPT,
  type Exp2Sentence,
} from '@/lib/experiments';
import { MetricTable } from '@/components/metric-table';
import { InfoHeading } from '@/components/info-heading';
import { ScoreCharts } from '@/components/score-charts';
import { ScoreScatter } from '@/components/score-scatter';
import { PlotGallery } from '@/components/plot-gallery';
import { ExampleClips, type ExampleClip } from '@/components/example-clips';

const EXPERIMENTS: Array<{ id: View; title: string }> = [
  { id: 1, title: 'Experiment 1: Focus' },
  { id: 2, title: 'Experiment 2: Ambiguity' },
  { id: 'listeners', title: 'Models as listeners' },
];

/**
 * The leaderboard, one experiment at a time. The switch at the top picks the experiment;
 * below it are that experiment's results table, charts, acoustic plots and example clips.
 * Every description sits behind the (i) next to its heading.
 */
export function LeaderboardPage({
  experiment,
  rows: allRows,
  listenerCounts,
  interpBySentence,
  sentences,
  examples,
}: {
  experiment: View;
  rows: MetricRow[];
  /** Trial, run and recording counts behind the model-listener view. */
  listenerCounts?: ListenerResults['counts'];
  /** Exp 2 interpretation counts per model and sentence, for the sentence filter. */
  interpBySentence: Exp2InterpBySentence;
  /** The Experiment 2 sentences, shown in its description. */
  sentences: Exp2Sentence[];
  examples: ExampleClip[];
}) {
  const { t } = useTheme();
  const columns = metricsFor(experiment);
  // Experiment 2: the sentences that count towards interpretation accuracy. All of them to start.
  const [counted, setCounted] = useState<string[]>(() => sentences.map((s) => s.condition));
  const filtering = experiment === 2 && counted.length < sentences.length;
  const rows = filtering ? withInterpSentences(allRows, interpBySentence, counted) : allRows;
  const anyData = columns.some((key) => hasData(rows, key));
  const title = EXPERIMENTS.find((e) => e.id === experiment)!.title;

  return (
    <>
      <InfoHeading id="leaderboard" title="Leaderboard" level="h1">
        Results from two human perception surveys, one experiment at a time, and from the speech models
        themselves listening to human recordings. Click a column header to sort by it. — means the model has no
        data for that column yet.
      </InfoHeading>

      <div
        className="mb-8 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1"
        style={{ background: t.muted }}
        role="group"
        aria-label="Experiment"
      >
        {EXPERIMENTS.map((e) => {
          const active = e.id === experiment;
          return (
            <Link
              key={e.id}
              href={`/leaderboard?exp=${e.id}`}
              scroll={false}
              data-testid={`exp-switch-${e.id}`}
              aria-current={active ? 'page' : undefined}
              className="whitespace-nowrap rounded-md px-3.5 py-1.5 text-[13px] font-medium no-underline"
              style={{
                background: active ? t.card : 'transparent',
                color: active ? t.fg : t.mutedFg,
                boxShadow: active ? t.shadow : 'none',
              }}
            >
              {e.title}
            </Link>
          );
        })}
      </div>

      {/* Keyed by experiment so the sort, the open descriptions and the picked plot reset. */}
      <div key={experiment}>
        {experiment === 'listeners' ? (
          <ListenerView rows={rows} counts={listenerCounts} sentences={sentences} />
        ) : (
        <>
        <section>
          <InfoHeading id="experiment" title={title}>
            {experiment === 1 ? <Exp1Description /> : <Exp2Description sentences={sentences} />}
          </InfoHeading>
          <MetricTable
            rows={rows}
            columns={columns}
            testId="lb"
            headerExtras={
              experiment === 2
                ? { exp2Interp: <SentenceFilter sentences={sentences} counted={counted} onChange={setCounted} /> }
                : undefined
            }
          />
          {!anyData && (
            <p data-testid="no-data" className="text-[13.5px]" style={{ margin: '12px 0 0', color: t.mutedFg }}>
              This experiment has no results yet.
            </p>
          )}
        </section>

        {anyData && (
          <section className="mt-10">
            <InfoHeading id="charts" title="Charts">
              The same numbers as the table, one chart per column, with the models ordered from highest to
              lowest. Percentages are drawn on a 0–100% scale and naturalness on the 1–5 rating scale.
              {experiment === 2 &&
                ' The Sentences menu beside the Interpretation accuracy column picks which sentences count towards accuracy, in the table and in these charts; naturalness always uses all five. The last chart plots each model’s naturalness against its interpretation accuracy; its axes are fitted to the data and do not start at zero.'}
            </InfoHeading>
            <ScoreCharts rows={rows} columns={columns} />
            {experiment === 2 && <ScoreScatter rows={rows} x="exp2Nat" y="exp2Interp" />}
          </section>
        )}

        <section className="mt-10">
          <InfoHeading id="plots" title="Acoustic plots">
            {experiment === 1 ? (
              <>
                Measured from each model&apos;s recordings of &ldquo;{EXP1_SENTENCE}&rdquo;, not from the survey. For
                each word, the three panels show its duration relative to &ldquo;melon&rdquo;, its highest pitch and
                its mean intensity (both as z-scores), with one line per focus condition. A word that carries
                focus should stand out in the line for its own condition.
              </>
            ) : (
              <>
                Measured from each model&apos;s recordings, not from the survey. For the word before the possible
                break in each sentence, the three panels show the pause after it, how long it is relative to
                the other words, and the pitch reset across the break. Each line joins one speaker&apos;s
                recordings of meaning A and meaning B, so a slope means the two readings were spoken differently.
              </>
            )}
          </InfoHeading>
          <PlotGallery experiment={experiment} />
        </section>

        <ExampleClips
          clips={examples}
          caption={
            experiment === 1
              ? 'Take 1 of the broad condition for each model.'
              : `“${sentences[0]?.text ?? ''}”, interpretation A, take 1, for each model.`
          }
        />
        </>
        )}
      </div>
    </>
  );
}

function Exp1Description() {
  return (
    <>
      <p style={{ margin: '0 0 10px' }}>
        A human perception survey on prosodic focus. Every model said the sentence &ldquo;{EXP1_SENTENCE}&rdquo; in
        five focus conditions ({EXP1_CONDITIONS.join(', ')}), with five takes per model per condition.
      </p>
      <p style={{ margin: '0 0 6px' }}>After each recording, listeners answered three required questions, in this order:</p>
      <ol className="list-decimal pl-5" style={{ margin: '0 0 10px' }}>
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
        Focus accuracy is the share of trials where the chosen question is the one the condition answers. Judged
        human is the share of trials where the listener answered Human. Attention-check trials are excluded.
      </p>
    </>
  );
}

function Exp2Description({ sentences }: { sentences: Exp2Sentence[] }) {
  const { t } = useTheme();
  return (
    <>
      <p style={{ margin: '0 0 10px' }}>
        A human perception survey on syntactic ambiguity. Five ambiguous sentences, each with two interpretations,
        A and B. Before each sentence&apos;s recordings, listeners were shown the sentence and its two
        interpretations.
      </p>
      <p style={{ margin: '0 0 6px' }}>After each recording, they answered two required questions, in this order:</p>
      <ol className="list-decimal pl-5" style={{ margin: '0 0 10px' }}>
        <li>{INTERPRETATION_PROMPT} A / B.</li>
        <li>
          {NATURALNESS_PROMPT} {NATURALNESS_OPTIONS[0]} … {NATURALNESS_OPTIONS[4]}.
        </li>
      </ol>
      <p style={{ margin: '0 0 12px' }}>
        There was no human-or-AI question. Interpretation accuracy is the share of trials where the chosen
        interpretation is the one the recording was made to convey. Attention-check trials are excluded.
      </p>
      <div data-testid="exp2-sentences">
        {sentences.map((s) => (
          <div key={s.condition} className="py-2 text-[13px] leading-[1.55]" style={{ borderTop: `1px solid ${t.border}` }}>
            <div className="font-semibold" style={{ color: t.fg }}>
              {s.text}
            </div>
            <div>A: {s.optionA}</div>
            <div>B: {s.optionB}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The models as listeners: each speech model hears the human recordings and answers the same
 * question the human survey asks. Ranked by accuracy; there are no plots or clips here.
 */
function ListenerView({
  rows,
  counts,
  sentences,
}: {
  rows: MetricRow[];
  counts?: ListenerResults['counts'];
  sentences: Exp2Sentence[];
}) {
  const { t } = useTheme();
  const columns = metricsFor('listeners');
  const c1 = counts ? Object.values(counts['1'])[0] : undefined;
  const c2 = counts ? Object.values(counts['2'])[0] : undefined;
  return (
    <>
      <section>
        <InfoHeading id="experiment" title="Models as listeners">
          <p style={{ margin: '0 0 10px' }}>
            The same two tasks, turned around: each speech model listens to recordings made by human speakers and
            answers the question the listeners in the surveys answered. Higher means the model hears more of the
            meaning that prosody carries.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <strong>Focus accuracy</strong> (Experiment 1 task): {c1 ? `${c1.recordings} human recordings` : 'human recordings'}{' '}
            of &ldquo;{EXP1_SENTENCE}&rdquo; in four conditions (broad, molly, mailed, melon); the model says which
            question the sentence answers. Chance is 25%. There is no human-listener baseline for this task yet.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <strong>Interpretation accuracy</strong> (Experiment 2 task):{' '}
            {c2 ? `${c2.recordings} human recordings` : 'human recordings'} of the {sentences.length} ambiguous
            sentences, each spoken to convey reading A or B; the model picks the intended reading. Chance is 50%.
            Human listeners heard the same recordings and are shown for comparison.
          </p>
          <p style={{ margin: 0 }}>
            Each model ran the whole set {c1?.runs ?? c2?.runs ?? 10} times (each human listener once); accuracy pools
            all runs, with the options in their original order. A score near chance often means the model gave
            nearly the same answer to every recording.
          </p>
        </InfoHeading>
        <MetricTable rows={rows} columns={columns} testId="lb" nameLabel="Listener" />
      </section>
      <section className="mt-10">
        <InfoHeading id="charts" title="Charts">
          The same numbers as the table, one chart per task, with the listeners ordered from highest to lowest on a
          0–100% scale. The dashed line marks chance: 25% for focus (four questions), 50% for interpretation (two
          readings).
        </InfoHeading>
        <ScoreCharts rows={rows} columns={columns} />
      </section>
      <p className="mt-4 text-[12.5px]" style={{ color: t.mutedFg }}>
        Listener models are the speech-to-speech and audio-input models we could query; they are not the same list as
        the speakers in Experiments 1 and 2.
      </p>
    </>
  );
}
