'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import type { ClipInfo } from '@/lib/clips';
import { attachAnalyser, barHeight, currentRms, detachAnalyser } from '@/lib/loudness';
import {
  HUMAN_AI_OPTIONS,
  HUMAN_AI_PROMPT,
  INTERPRETATION_PROMPT,
  NATURALNESS_OPTIONS,
  NATURALNESS_PROMPT,
  QUESTION_OPTIONS,
  QUESTION_PROMPT,
  type Exp2Sentence,
  type HumanOrAi,
  type Interpretation,
} from '@/lib/experiments';

/** Bars in the loudness timeline: each one is 1/48 of the clip. */
const BARS = 48;

function fmt(sec: number) {
  return '0:' + Math.max(0, sec).toFixed(1).padStart(4, '0');
}

/** The URL the arena serves a clip from. */
export function clipSrc(clip: ClipInfo): string {
  return `/api/audio/${encodeURIComponent(clip.file)}`;
}

/** A finished trial's answers, by experiment. Naturalness is 1–5. */
export type TrialAnswers =
  | { experiment: 1; naturalness: number; humanOrAi: HumanOrAi; questionAnswered: string }
  | { experiment: 2; naturalness: number; interpretation: Interpretation };

/** How the participant spent the trial. */
export interface TrialTiming {
  /** Audio actually heard, in ms (the element's own clock: pauses and seeks don't count). */
  listenedMs: number;
  /** From the clip first being shown (this player mounting) to Submit, in ms. */
  responseMs: number;
}

/**
 * The play screen for one clip: the clip graphic (a Web Audio loudness timeline, or a plain
 * progress bar under reduced motion or without Web Audio), then the questions one at a time
 * in a picker card. Submit is enabled once every question is answered and the clip has played
 * through. Keys: the number or letter beside a row picks it, Enter is Next/Submit, Space plays
 * or pauses.
 *
 * Renders a fragment: `header` (if any), the clip card, then the question card (or
 * `submittedView` once submitted). Mount one per clip and give it a `key` that changes with the
 * clip (e.g. the clip file or round id): a new key starts the questions afresh and clears the
 * loudness timeline. Back only moves within this clip's questions.
 */
export interface TrialPlayerProps {
  /** The clip being judged. Its `experiment` picks the questions (Exp 1: naturalness, human or
   *  AI, which question; Exp 2: interpretation, naturalness). */
  clip: ClipInfo;
  /** Audio URL. Defaults to the arena's `/api/audio/{file}` (see `clipSrc`). */
  src?: string;
  /** Exp 2 only: the sentence whose two readings label the interpretation rows. */
  sentence?: Exp2Sentence | null;
  /** Rendered above the clip card, e.g. a "Clip N of 50" line and a progress bar. */
  header?: ReactNode;
  /**
   * Called once on Submit, after the audio is paused. If it returns a promise that rejects, the
   * player unlocks so the participant can submit again; otherwise it stays submitted.
   */
  onSubmit: (answers: TrialAnswers, timing: TrialTiming) => void | Promise<void>;
  /** While true, Submit, Next, Back and the rows are disabled (and Submit reads "Submitting…").
   *  The clip can still be played. */
  submitting?: boolean;
  /** Replaces the question card once submitted (e.g. "Response recorded" + Next clip). When
   *  omitted, the question card stays on screen, locked. */
  submittedView?: ReactNode;
  /** Start in the submitted state (shows `submittedView`): a reload after a saved response. */
  alreadySubmitted?: boolean;
  /** Fetched in the background once this clip has played through, so the next clip starts at
   *  once. The audio route is cached immutably, so the next `<audio>` hits the cache. */
  preloadSrc?: string;
}

/** One question of a round: its survey wording, the picker rows and the key that picks each. */
interface Step {
  id: string;
  prompt: string;
  options: { value: string; label: string; hint: string }[];
  value: string | null;
  pick: (value: string) => void;
}

export function TrialPlayer({
  clip,
  src,
  sentence = null,
  header,
  onSubmit,
  submitting = false,
  submittedView,
  alreadySubmitted = false,
  preloadSrc,
}: TrialPlayerProps) {
  const { t } = useTheme();
  const exp = clip.experiment;

  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [nat, setNat] = useState<number | null>(null);
  const [hai, setHai] = useState<HumanOrAi | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [interp, setInterp] = useState<Interpretation | null>(null);
  /** Index of the question on screen. */
  const [stepIndex, setStepIndex] = useState(0);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  /** 'bars' = the loudness timeline; 'progress' = a plain progress bar (reduced motion, or no
   *  Web Audio). */
  const [meter, setMeter] = useState<'bars' | 'progress'>('bars');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  /** performance.now() when the clip was first shown. */
  const shownAtRef = useRef(0);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Loudness measured for each slice of the clip, -1 where it has not been played yet. */
  const levels = useRef<Float32Array>(new Float32Array(BARS).fill(-1));
  const loud = useRef({ peak: 0, last: -1, lastRms: 0, wired: false });

  useEffect(() => {
    shownAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (mq.matches) setMeter('progress');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    return () => {
      if (a) detachAnalyser(a);
    };
  }, []);

  useEffect(() => {
    if (!preloadSrc || !completed) return;
    void fetch(preloadSrc).catch(() => {});
  }, [preloadSrc, completed]);

  /** Redraws the played bars from the measured levels (all of them: the scale follows the peak). */
  const drawBars = useCallback(() => {
    const { peak, last } = loud.current;
    for (let k = 0; k < BARS; k++) {
      const el = barRefs.current[k];
      if (!el) continue;
      const v = levels.current[k];
      if (k > last || v < 0) {
        if (el.dataset.level !== '') {
          el.dataset.level = '';
          el.style.height = '3px';
          el.style.background = 'var(--arena-track)';
        }
      } else {
        const h = barHeight(v, peak);
        el.dataset.level = h.toFixed(3);
        el.style.height = `${Math.max(3, Math.round(h * 44))}px`;
        el.style.background = 'var(--arena-bar)';
      }
    }
  }, []);

  /** Clears the timeline: nothing about the clip's loudness is shown until it is played again. */
  const clearBars = useCallback(() => {
    levels.current.fill(-1);
    loud.current.peak = 0;
    loud.current.last = -1;
    loud.current.lastRms = 0;
    drawBars();
  }, [drawBars]);

  /** Reads the element's own clock (and, with Web Audio, how loud it is right now). Called from
   *  rAF while playing and from timeupdate (which keeps listened time accruing in a background
   *  tab where rAF stops). */
  const sample = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const d = a.currentTime - lastTimeRef.current;
    if (d > 0 && d < 1) listenedRef.current += d;
    lastTimeRef.current = a.currentTime;
    const progress = a.duration > 0 ? Math.min(a.currentTime / a.duration, 1) : 0;
    if (timeRef.current) timeRef.current.textContent = fmt(a.currentTime);
    if (fillRef.current) fillRef.current.style.width = `${(progress * 100).toFixed(1)}%`;

    const L = loud.current;
    if (!L.wired || a.paused || !(a.duration > 0)) return;
    const rms = currentRms(a);
    const idx = Math.min(BARS - 1, Math.floor(progress * BARS));
    // Slices a slow frame skipped get a value between the last reading and this one.
    for (let k = L.last + 1; k < idx; k++) {
      const f = (k - L.last) / (idx - L.last);
      levels.current[k] = L.lastRms + (rms - L.lastRms) * f;
    }
    levels.current[idx] = Math.max(levels.current[idx], rms);
    L.last = Math.max(L.last, idx);
    L.lastRms = rms;
    L.peak = Math.max(L.peak, rms);
    drawBars();
  }, [drawBars]);

  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      sample();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, sample]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    // Wire the analyser from the play gesture: that is when a browser lets audio start.
    if (meter === 'bars') {
      if (attachAnalyser(a)) loud.current.wired = true;
      else setMeter('progress');
    }
    if (a.ended || a.currentTime === 0) {
      a.currentTime = 0;
      lastTimeRef.current = 0;
      clearBars();
    }
    void a.play().catch(() => setPlaying(false));
  }, [meter, clearBars]);

  const restart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    lastTimeRef.current = 0;
    if (timeRef.current) timeRef.current.textContent = fmt(0);
    if (fillRef.current) fillRef.current.style.width = '0%';
    clearBars();
  }, [clearBars]);

  const steps: Step[] = useMemo(() => {
    const naturalness: Step = {
      id: 'nat',
      prompt: NATURALNESS_PROMPT,
      options: NATURALNESS_OPTIONS.map((label, i) => ({ value: String(i + 1), label, hint: String(i + 1) })),
      value: nat === null ? null : String(nat),
      pick: (v) => setNat(Number(v)),
    };
    if (exp === 1) {
      return [
        naturalness,
        {
          id: 'hai',
          prompt: HUMAN_AI_PROMPT,
          options: HUMAN_AI_OPTIONS.map((v) => ({ value: v, label: v, hint: v[0] })),
          value: hai,
          pick: (v) => setHai(v as HumanOrAi),
        },
        {
          id: 'q',
          prompt: QUESTION_PROMPT,
          options: QUESTION_OPTIONS.map((label, i) => ({ value: String(i), label, hint: String(i + 1) })),
          value: question === null ? null : String(QUESTION_OPTIONS.indexOf(question as (typeof QUESTION_OPTIONS)[number])),
          pick: (v) => setQuestion(QUESTION_OPTIONS[Number(v)]),
        },
      ];
    }
    return [
      {
        id: 'interp',
        prompt: INTERPRETATION_PROMPT,
        options: (['A', 'B'] as const).map((v) => ({
          value: v,
          label: `${v}: ${(v === 'A' ? sentence?.optionA : sentence?.optionB) ?? ''}`,
          hint: v,
        })),
        value: interp,
        pick: (v) => setInterp(v as Interpretation),
      },
      naturalness,
    ];
  }, [exp, nat, hai, question, interp, sentence]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const answered = steps.every((s) => s.value !== null);
  const locked = submitted || submitting;
  const canSubmit = completed && answered && !locked;
  const canNext = step.value !== null && !submitting;

  const submit = useCallback(() => {
    if (!canSubmit || nat === null) return;
    let answers: TrialAnswers;
    if (exp === 1) {
      if (hai === null || question === null) return;
      answers = { experiment: 1, naturalness: nat, humanOrAi: hai, questionAnswered: question };
    } else {
      if (interp === null) return;
      answers = { experiment: 2, naturalness: nat, interpretation: interp };
    }
    audioRef.current?.pause();
    setSubmitted(true);
    const timing: TrialTiming = {
      listenedMs: Math.round(listenedRef.current * 1000),
      responseMs: Math.round(performance.now() - shownAtRef.current),
    };
    const result = onSubmit(answers, timing);
    if (result && typeof result.then === 'function') result.catch(() => setSubmitted(false));
  }, [canSubmit, exp, nat, hai, question, interp, onSubmit]);

  /** Next on every question but the last, Submit on the last. */
  const advance = useCallback(() => {
    if (locked) return;
    if (isLast) submit();
    else if (canNext) setStepIndex((i) => i + 1);
  }, [locked, isLast, canNext, submit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const onControl = target !== null && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
      // The clip's own controls and the picker rows don't claim Enter for themselves.
      const passesEnter = target !== null && target.closest('[data-arena-enter]') !== null;
      if (e.key === ' ') {
        if (onControl) return; // Space presses the focused control
        e.preventDefault();
        play();
      } else if (e.key === 'Enter') {
        // Enter moves on, also right after clicking Play or a picker row (which leaves the focus
        // there). On any other control (Back, Next, a link…) it presses that control.
        if (onControl && !passesEnter) return;
        e.preventDefault();
        advance();
      } else if (!locked) {
        const option = step.options.find((o) => o.hint.toLowerCase() === e.key.toLowerCase());
        if (option) step.pick(option.value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, advance, locked, step]);

  const hint = !isLast || canSubmit || locked ? '' : step.value === null ? 'Pick an answer to submit.' : 'Play the clip to submit.';

  const smallButton = 'rounded-lg px-4 py-2 text-[13px] font-semibold';
  const primaryStyle = (enabled: boolean) => ({
    background: t.primary,
    color: t.primaryFg,
    border: `1px solid ${t.primary}`,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontFamily: 'inherit',
  });

  const showQuestion = !submitted || submittedView === undefined;

  return (
    <>
      {header}
      <div
        className="mb-3 rounded-[10px] px-4 py-3"
        style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        data-testid="arena-clip"
        data-completed={completed ? 'true' : 'false'}
      >
        <audio
          ref={audioRef}
          src={src ?? clipSrc(clip)}
          preload="auto"
          onTimeUpdate={sample}
          onPlay={() => {
            if (audioRef.current) lastTimeRef.current = audioRef.current.currentTime;
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            sample();
            // The last frame rarely lands on the final slice: close the timeline with the last
            // reading, so a finished clip never shows unplayed slots.
            const L = loud.current;
            if (L.wired && L.last >= 0 && L.last < BARS - 1) {
              levels.current.fill(L.lastRms, L.last + 1);
              L.last = BARS - 1;
              drawBars();
            }
            setPlaying(false);
            setCompleted(true);
            if (fillRef.current) fillRef.current.style.width = '100%';
          }}
          data-testid="arena-audio"
        />

        <div className="flex items-center gap-3" data-arena-enter="">
          <button
            type="button"
            data-testid="arena-play"
            onClick={play}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-0"
            style={{ background: t.primary }}
          >
            <span className="text-sm leading-none" style={{ color: t.primaryFg }}>
              {playing ? '❚❚' : '▶'}
            </span>
          </button>

          {meter === 'bars' ? (
            // Loudness timeline: one bar per 1/48 of the clip, drawn as that part is played.
            <div
              data-testid="arena-meter"
              data-mode="bars"
              role="img"
              aria-label="Loudness of the clip as it plays"
              className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
              style={{ '--arena-bar': t.fg, '--arena-track': t.border } as React.CSSProperties}
              onClick={play}
            >
              {Array.from({ length: BARS }, (_, k) => (
                <div
                  key={k}
                  ref={(el) => {
                    barRefs.current[k] = el;
                  }}
                  data-testid="arena-bar"
                  data-level=""
                  className="min-w-[1px] flex-1 rounded-full"
                  style={{ height: 3, background: 'var(--arena-track)', transition: 'height 90ms ease-out' }}
                />
              ))}
            </div>
          ) : (
            <div
              data-testid="arena-meter"
              data-mode="progress"
              className="flex h-12 min-w-0 flex-1 cursor-pointer items-center"
              onClick={play}
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: t.border }}>
                <div ref={fillRef} className="h-full rounded-full" style={{ width: '0%', background: t.fg }} />
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="arena-restart"
            onClick={restart}
            aria-label="Restart"
            className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-[13px]"
            style={{ border: `1px solid ${t.border}`, color: t.mutedFg }}
          >
            ↺
          </button>
        </div>

        <div className="mt-1.5 flex items-center text-[11.5px]" style={{ color: t.mutedFg }}>
          <span ref={timeRef} className="font-medium" style={{ fontFamily: MONO }}>
            {fmt(0)}
          </span>
          <span
            data-testid="arena-status"
            className="ml-auto font-semibold"
            style={{ color: completed ? t.success : t.mutedFg }}
          >
            {completed ? '✓ Played' : 'Play the clip through once'}
          </span>
        </div>
      </div>

      {showQuestion && (
        <div
          data-testid="arena-question"
          className="rounded-[10px] px-4 py-4"
          style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        >
          <div className="mb-1 text-[11px] font-semibold tracking-wide" style={{ color: t.mutedFg }} data-testid="arena-step">
            {stepIndex + 1} of {steps.length}
          </div>
          <div className="mb-3 text-[13.5px] font-semibold" data-testid="arena-prompt">
            {step.prompt}
          </div>

          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={step.prompt}>
            {step.options.map((o) => {
              const picked = step.value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  data-arena-enter=""
                  data-testid={`arena-${step.id}-${o.value}`}
                  onClick={() => step.pick(o.value)}
                  disabled={locked || undefined}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium"
                  style={{
                    border: `1px solid ${picked ? t.fg : t.border}`,
                    background: picked ? t.accent : t.card,
                    color: t.fg,
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                    style={{
                      fontFamily: MONO,
                      background: picked ? t.primary : t.muted,
                      color: picked ? t.primaryFg : t.mutedFg,
                    }}
                  >
                    {o.hint}
                  </span>
                  <span className="min-w-0">{o.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1 text-[11.5px] font-medium" style={{ color: t.mutedFg }} data-testid="arena-hint">
              {hint}
            </div>
            {stepIndex > 0 && (
              <button
                type="button"
                data-testid="arena-back"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={locked || undefined}
                className={`${smallButton} cursor-pointer bg-transparent`}
                style={{ border: `1px solid ${t.border}`, color: t.fg, fontFamily: 'inherit' }}
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                data-testid="arena-submit"
                onClick={submit}
                disabled={!canSubmit}
                className={smallButton}
                style={primaryStyle(canSubmit)}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            ) : (
              <button
                type="button"
                data-testid="arena-next-question"
                onClick={advance}
                disabled={!canNext}
                className={smallButton}
                style={primaryStyle(canNext)}
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {submitted && submittedView}
    </>
  );
}
