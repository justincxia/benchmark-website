'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import type { Experiment } from '@/lib/models';
import { buildBlock, clipBars, type ClipInfo } from '@/lib/clips';
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

const PARTICIPANT_KEY = 'arena_participant';
const MODE_KEY = 'arena_mode';
const sessionKey = (exp: Experiment) => `arena_session_exp${exp}`;

interface Session {
  session: string;
  /** Filenames, revalidated against the manifest on load so a corpus change starts a fresh
   *  block instead of 404ing mid-session. */
  block: string[];
  answered: number;
}

// crypto.randomUUID() exists only on secure origins; a plain-http lab machine needs a fallback.
function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through
  }
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function newSession(clips: ClipInfo[], exp: Experiment): Session {
  return { session: makeId(), block: buildBlock(clips, exp, Math.random).map((c) => c.file), answered: 0 };
}

function loadSession(clips: ClipInfo[], exp: Experiment): Session {
  try {
    const raw = window.localStorage.getItem(sessionKey(exp));
    if (raw) {
      const s = JSON.parse(raw) as Session;
      const known = new Set(clips.filter((c) => c.experiment === exp).map((c) => c.file));
      if (
        typeof s.session === 'string' &&
        s.session !== '' &&
        Array.isArray(s.block) &&
        s.block.length > 0 &&
        s.block.every((f) => typeof f === 'string' && known.has(f)) &&
        Number.isInteger(s.answered) &&
        s.answered >= 0 &&
        s.answered < s.block.length
      ) {
        return s;
      }
    }
  } catch {
    // Corrupt JSON or blocked storage: start a fresh block.
  }
  return newSession(clips, exp);
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: state lives for this page view only.
  }
}

function fmt(sec: number) {
  return '0:' + Math.max(0, sec).toFixed(1).padStart(4, '0');
}

export function ArenaPage({
  clips,
  sentences,
  manifestError,
}: {
  clips: ClipInfo[];
  sentences: Exp2Sentence[];
  manifestError: string | null;
}) {
  const { t } = useTheme();
  const [mode, setMode] = useState<Experiment | null>(null);
  const [sessions, setSessions] = useState<Partial<Record<Experiment, Session>>>({});
  const [participant, setParticipant] = useState<string | null>(null);
  /** The round whose sentence screen has been dismissed (Exp 2). */
  const [introDone, setIntroDone] = useState<string | null>(null);
  const clipsRef = useRef(clips);

  const byFile = useMemo(() => new Map(clips.map((c) => [c.file, c])), [clips]);

  // Mount-only: participant id, mode and both blocks need localStorage and Math.random,
  // neither of which can run during render without breaking hydration.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(PARTICIPANT_KEY);
      if (!id) {
        id = makeId();
        window.localStorage.setItem(PARTICIPANT_KEY, id);
      }
    } catch {
      id = makeId();
    }
    let m: Experiment = 1;
    try {
      if (window.localStorage.getItem(MODE_KEY) === '2') m = 2;
    } catch {
      // default mode
    }
    const all = clipsRef.current;
    const next: Partial<Record<Experiment, Session>> = {};
    for (const exp of [1, 2] as const) {
      if (all.some((c) => c.experiment === exp)) next[exp] = loadSession(all, exp);
    }
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setParticipant(id);
    setSessions(next);
    setMode(m);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    for (const exp of [1, 2] as const) {
      const s = sessions[exp];
      if (s) store(sessionKey(exp), JSON.stringify(s));
    }
  }, [sessions]);

  const switchMode = (m: Experiment) => {
    setMode(m);
    store(MODE_KEY, String(m));
  };

  const session = mode ? sessions[mode] : undefined;
  const clip = session ? byFile.get(session.block[session.answered]) ?? null : null;
  const prev = session && session.answered > 0 ? byFile.get(session.block[session.answered - 1]) : undefined;
  const roundId = session ? `${session.session}:${session.answered}` : '';
  const sentence = clip && clip.experiment === 2 ? sentences.find((s) => s.condition === clip.condition) ?? null : null;
  const showIntro =
    mode === 2 && clip !== null && sentence !== null && (!prev || prev.condition !== clip.condition) && introDone !== roundId;
  const groupSize = session && clip ? session.block.filter((f) => byFile.get(f)?.condition === clip.condition).length : 0;

  const next = useCallback(() => {
    if (!mode) return;
    setSessions((all) => {
      const s = all[mode];
      if (!s) return all;
      const answered = s.answered + 1;
      // Finishing the block starts a new one: fresh session id, same participant.
      const ns = answered >= s.block.length ? newSession(clipsRef.current, mode) : { ...s, answered };
      return { ...all, [mode]: ns };
    });
  }, [mode]);

  if (manifestError) {
    return (
      <div
        data-testid="arena-unavailable"
        className="rounded-[10px] p-[22px] text-[13.5px]"
        style={{ background: t.card, border: `1px solid ${t.border}`, color: t.mutedFg }}
      >
        <div className="mb-2 font-semibold" style={{ color: t.fg }}>
          Stimuli unavailable
        </div>
        {manifestError}
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
          Arena
        </h1>
        <p className="text-sm" style={{ margin: 0, color: t.mutedFg }}>
          Take the survey trials yourself: listen to one clip, then answer the questions.
        </p>
      </div>

      <div className="mb-5 flex rounded-lg p-[3px]" style={{ background: t.muted }} role="tablist">
        {([1, 2] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`arena-mode-${m}`}
              onClick={() => switchMode(m)}
              className="flex-1 cursor-pointer rounded-md border-0 px-3.5 py-1.5 text-[12.5px] font-semibold"
              style={{
                background: active ? t.card : 'transparent',
                color: active ? t.fg : t.mutedFg,
                boxShadow: active ? t.shadow : 'none',
                fontFamily: 'inherit',
              }}
            >
              Experiment {m}
            </button>
          );
        })}
      </div>

      <div
        className="mb-5 flex items-start gap-2.5 rounded-lg px-4 py-3"
        style={{ background: t.muted, border: `1px solid ${t.border}` }}
      >
        <div className="mt-[3px] h-[15px] w-[15px] flex-shrink-0 rounded-full" style={{ border: `1.5px solid ${t.mutedFg}` }} />
        <div className="text-[13px] leading-[1.55]">
          <div className="mb-0.5 font-semibold">Instructions</div>
          <span style={{ color: t.mutedFg }}>
            Play the clip through at least once, then answer every question and submit. You can replay it. We
            recommend a quiet space with headphones.
          </span>
        </div>
      </div>

      {mode && !session && (
        <div data-testid="arena-empty" className="rounded-[10px] p-[22px] text-[13.5px]" style={{ background: t.card, border: `1px solid ${t.border}`, color: t.mutedFg }}>
          No Experiment {mode} stimuli are available.
        </div>
      )}

      {session && clip && participant && mode && showIntro && sentence && (
        <div
          data-testid="arena-intro"
          className="rounded-[10px] p-5 text-[13.5px] leading-[1.6]"
          style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        >
          <div className="mb-3">
            <b>Sentence:</b> {sentence.text}
          </div>
          <div>
            <b>Interpretation A:</b> {sentence.optionA}
          </div>
          <div className="mb-3">
            <b>Interpretation B:</b> {sentence.optionB}
          </div>
          <div className="mb-4" style={{ color: t.mutedFg }}>
            You will now hear {groupSize} recordings of this sentence in a random order. After each one, choose
            whether the speaker meant A or B.
          </div>
          <button
            type="button"
            data-testid="arena-intro-continue"
            onClick={() => setIntroDone(roundId)}
            className="cursor-pointer rounded-lg border-0 px-[22px] py-[11px] text-[13.5px] font-semibold"
            style={{ background: t.primary, color: t.primaryFg, fontFamily: 'inherit' }}
          >
            Continue
          </button>
        </div>
      )}

      {session && clip && participant && mode && !showIntro && (
        <ArenaRound
          key={roundId}
          clip={clip}
          sentence={sentence}
          participant={participant}
          session={session}
          onNext={next}
        />
      )}
    </>
  );
}

function ArenaRound({
  clip,
  sentence,
  participant,
  session,
  onNext,
}: {
  clip: ClipInfo;
  sentence: Exp2Sentence | null;
  participant: string;
  session: Session;
  onNext: () => void;
}) {
  const { t } = useTheme();
  const exp = clip.experiment;

  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [nat, setNat] = useState<number | null>(null);
  const [hai, setHai] = useState<HumanOrAi | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [interp, setInterp] = useState<Interpretation | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const bars = useMemo(() => clipBars(clip.file), [clip.file]);

  /** Reads the element's own clock. Called from rAF while playing and from timeupdate (which
   *  keeps listened time accruing in a background tab where rAF stops). */
  const sample = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const d = a.currentTime - lastTimeRef.current;
    if (d > 0 && d < 1) listenedRef.current += d;
    lastTimeRef.current = a.currentTime;
    setElapsed(a.currentTime);
    setProgress(a.duration > 0 ? Math.min(a.currentTime / a.duration, 1) : 0);
  }, []);

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
    if (a.ended) {
      a.currentTime = 0;
      lastTimeRef.current = 0;
    }
    void a.play().catch(() => setPlaying(false));
  }, []);

  const restart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    lastTimeRef.current = 0;
    setProgress(0);
    setElapsed(0);
  }, []);

  const answered = exp === 1 ? nat !== null && hai !== null && question !== null : interp !== null && nat !== null;
  const canSubmit = completed && answered && !submitted;

  const postResponse = useCallback(async () => {
    setSaveState('saving');
    const answers =
      exp === 1 ? { humanOrAi: hai, questionAnswered: question } : { interpretation: interp };
    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          participant,
          session: session.session,
          round: session.answered,
          clip: clip.file,
          naturalness: nat,
          ...answers,
          listenedMs: Math.round(listenedRef.current * 1000),
        }),
      });
      setSaveState(res.ok ? 'saved' : 'failed');
    } catch {
      setSaveState('failed');
    }
  }, [exp, hai, question, interp, nat, participant, session, clip.file]);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    audioRef.current?.pause();
    setSubmitted(true);
    void postResponse();
  }, [canSubmit, postResponse]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|BUTTON/.test(target.tagName) && e.key === ' ') return;
      if (e.key === ' ') {
        e.preventDefault();
        play();
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        // The naturalness prompt says "by pressing one of the following keys".
        if (!submitted) setNat(Number(e.key));
      } else if (e.key === 'Enter') {
        submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, submit, submitted]);

  const natQuestion = (
    <Question title={NATURALNESS_PROMPT}>
      <Options
          disabled={submitted}
        name="nat"
        options={NATURALNESS_OPTIONS.map((label, i) => ({ value: i + 1, label }))}
        value={nat}
        onPick={setNat}
      />
    </Question>
  );

  const questions =
    exp === 1 ? (
      <>
        {natQuestion}
        <Question title={HUMAN_AI_PROMPT}>
          <Options disabled={submitted} name="hai" options={HUMAN_AI_OPTIONS.map((v) => ({ value: v, label: v }))} value={hai} onPick={setHai} />
        </Question>
        <Question title={QUESTION_PROMPT}>
          <Options
          disabled={submitted}
            name="q"
            options={QUESTION_OPTIONS.map((v, i) => ({ value: String(i), label: v }))}
            value={question === null ? null : String(QUESTION_OPTIONS.indexOf(question as (typeof QUESTION_OPTIONS)[number]))}
            onPick={(i) => setQuestion(QUESTION_OPTIONS[Number(i)])}
          />
        </Question>
      </>
    ) : (
      <>
        <Question title={INTERPRETATION_PROMPT}>
          <Options
          disabled={submitted}
            name="interp"
            options={[
              { value: 'A' as Interpretation, label: `A: ${sentence?.optionA ?? ''}` },
              { value: 'B' as Interpretation, label: `B: ${sentence?.optionB ?? ''}` },
            ]}
            value={interp}
            onPick={setInterp}
          />
        </Question>
        {natQuestion}
      </>
    );

  const nQuestions = exp === 1 ? 'three' : 'both';
  const submitLabel = !completed
    ? 'Play the clip through once to submit'
    : !answered
      ? `Answer ${nQuestions} questions to submit`
      : 'Submit answer';

  const nextButton = (
    <button
      type="button"
      data-testid="arena-next"
      onClick={onNext}
      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-0 px-[22px] py-[11px] text-[13.5px] font-semibold"
      style={{ background: t.primary, color: t.primaryFg, fontFamily: 'inherit' }}
    >
      Next clip <span className="text-sm">→</span>
    </button>
  );

  return (
    <>
      <div className="mb-4 rounded-[10px] p-5" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
        <div className="mb-3.5 flex items-center gap-2">
          <span
            data-testid="arena-progress"
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ color: t.secondaryFg, background: t.secondary, border: `1px solid ${t.border}` }}
          >
            Clip {session.answered + 1} of {session.block.length}
          </span>
        </div>

        <audio
          ref={audioRef}
          src={`/api/audio/${encodeURIComponent(clip.file)}`}
          preload="auto"
          onTimeUpdate={sample}
          onPlay={() => {
            if (audioRef.current) lastTimeRef.current = audioRef.current.currentTime;
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCompleted(true);
            setProgress(1);
          }}
          data-testid="arena-audio"
        />

        <div className="mb-3.5 flex h-[72px] cursor-pointer items-center gap-[3px] px-1" onClick={play} data-testid="arena-waveform">
          {bars.map((h, k) => (
            <div
              key={k}
              className="min-w-[2px] flex-1 rounded-sm"
              style={{ height: Math.round(h * 62) + 'px', background: (k + 0.5) / bars.length <= progress ? t.fg : t.muted }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2.5">
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
          <button
            type="button"
            onClick={restart}
            aria-label="Restart"
            className="flex h-[34px] w-[34px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-[13px]"
            style={{ border: `1px solid ${t.border}`, color: t.mutedFg }}
          >
            ↺
          </button>
          <div className="text-[12.5px] font-medium" style={{ fontFamily: MONO, color: t.mutedFg }}>
            {fmt(elapsed)}
          </div>
          <div
            data-testid="arena-status"
            className="ml-auto text-[11.5px] font-semibold"
            style={{ color: completed ? t.success : t.mutedFg }}
          >
            {completed ? '✓ Ready' : 'Play the clip through once'}
          </div>
        </div>
      </div>

      {questions}

      {!submitted && (
        <button
          type="button"
          data-testid="arena-submit"
          onClick={submit}
          aria-disabled={!canSubmit}
          className="mt-1.5 w-full rounded-lg border-0 p-3 text-center text-sm font-semibold"
          style={{
            background: t.primary,
            color: t.primaryFg,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.5,
            fontFamily: 'inherit',
          }}
        >
          {submitLabel}
        </button>
      )}

      {submitted && (
        <div className="mt-1.5 rounded-[10px] p-[22px] text-center" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          {saveState === 'failed' ? (
            <>
              <div data-testid="arena-save-failed" className="mb-4 text-[13.5px] font-semibold" style={{ color: t.mutedFg }}>
                Couldn&apos;t save your response.
              </div>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  data-testid="arena-retry"
                  onClick={() => void postResponse()}
                  className="inline-flex cursor-pointer items-center rounded-lg bg-transparent px-[22px] py-[11px] text-[13.5px] font-semibold"
                  style={{ border: `1px solid ${t.border}`, color: t.fg, fontFamily: 'inherit' }}
                >
                  Retry
                </button>
                {nextButton}
              </div>
            </>
          ) : (
            <>
              <div data-testid="arena-recorded" className="mb-4 text-[13.5px] font-semibold" style={{ color: t.mutedFg }}>
                {saveState === 'saving' ? 'Saving…' : 'Response recorded'}
              </div>
              {saveState !== 'saving' && nextButton}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div className="mb-3.5 rounded-[10px] px-5 py-[18px]" style={{ background: t.card, border: `1px solid ${t.border}` }}>
      <div className="mb-3 text-[13.5px] font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Options<T extends string | number>({
  name,
  options,
  value,
  onPick,
  disabled,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T | null;
  onPick: (v: T) => void;
  disabled: boolean;
}) {
  const { t } = useTheme();
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => {
        const picked = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            data-testid={`arena-${name}-${o.value}`}
            aria-pressed={picked}
            onClick={() => !disabled && onPick(o.value)}
            className="rounded-lg px-3.5 py-2.5 text-left text-[13.5px] font-medium"
            style={{
              border: `1px solid ${picked ? t.fg : t.border}`,
              background: picked ? t.accent : t.card,
              color: t.fg,
              cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
