'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import type { Experiment } from '@/lib/models';
import { buildBlock, type ClipInfo } from '@/lib/clips';
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

const PARTICIPANT_KEY = 'arena_participant';
const MODE_KEY = 'arena_mode';
/** sessionStorage: Play now was pressed during this visit, so the instructions stay hidden. */
const STARTED_KEY = 'arena_started';
/** Bars in the loudness timeline: each one is 1/48 of the clip. */
const BARS = 48;
const sessionKey = (exp: Experiment) => `arena_session_exp${exp}`;

interface Session {
  session: string;
  /** Filenames, revalidated against the manifest on load so a corpus change starts a fresh
   *  block instead of 404ing mid-session. */
  block: string[];
  answered: number;
  /** The current round's response has been saved. Persisted so a reload after submitting
   *  shows "Response recorded" instead of a fresh form for the same round. */
  submitted?: boolean;
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
        s.answered < s.block.length &&
        (s.submitted === undefined || typeof s.submitted === 'boolean')
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
  /** false = the start screen (instructions + Play now); true = the play screen. */
  const [started, setStarted] = useState(false);
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
    let wasStarted = false;
    try {
      wasStarted = window.sessionStorage.getItem(STARTED_KEY) === '1';
    } catch {
      // start screen
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
    setStarted(wasStarted && next[m] !== undefined);
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

  const setPlayScreen = (on: boolean) => {
    setStarted(on);
    // Either screen starts at the top: on a phone, Play now sits below the fold of the start
    // screen, and the play screen is laid out to fit without scrolling.
    window.scrollTo(0, 0);
    try {
      if (on) window.sessionStorage.setItem(STARTED_KEY, '1');
      else window.sessionStorage.removeItem(STARTED_KEY);
    } catch {
      // Blocked storage: the choice lives for this page view only.
    }
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
      const ns = answered >= s.block.length ? newSession(clipsRef.current, mode) : { ...s, answered, submitted: false };
      return { ...all, [mode]: ns };
    });
  }, [mode]);

  /** Marks the round as saved, if it is still the current round of that session. */
  const markSubmitted = useCallback(
    (sessionId: string, round: number) => {
      if (!mode) return;
      setSessions((all) => {
        const s = all[mode];
        if (!s || s.session !== sessionId || s.answered !== round || s.submitted) return all;
        return { ...all, [mode]: { ...s, submitted: true } };
      });
    },
    [mode]
  );

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

  // Nothing until localStorage has been read, so a returning visitor never sees the start
  // screen flash by on the way to their clip.
  if (!mode) return <div style={{ minHeight: 320 }} />;

  if (!started || !session || !clip || !participant) {
    return (
      <div data-testid="arena-start">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
          Arena
        </h1>
        <p className="text-sm" style={{ margin: '0 0 18px', color: t.mutedFg }}>
          Take the survey trials yourself: listen to one clip, then answer the questions.
        </p>

        <div
          data-testid="arena-instructions"
          className="mb-5 rounded-[10px] px-5 py-[18px] text-[13.5px] leading-[1.6]"
          style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        >
          <div className="mb-2 font-semibold">Instructions</div>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5" style={{ color: t.mutedFg }}>
            <li>Each round plays one recording. Play it through at least once; you can replay it.</li>
            <li>
              The questions come one at a time. Pick an option, then press Next. Back lets you change an earlier
              answer, and the last question has Submit.
            </li>
            <li>
              Keys: Space plays or pauses the clip, the number or letter beside an option picks it, and Enter moves
              on.
            </li>
            <li>We recommend a quiet space with headphones.</li>
          </ul>
        </div>

        <div className="mb-2 flex rounded-lg p-[3px]" style={{ background: t.muted }} role="tablist">
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
        <p className="text-[12.5px]" style={{ margin: '0 0 20px', color: t.mutedFg }} data-testid="arena-mode-note">
          {!session
            ? `No Experiment ${mode} stimuli are available.`
            : mode === 1
              ? `Focus: ${session.block.length} recordings of one sentence, three questions each.`
              : `Ambiguity: ${session.block.length} recordings of five sentences, two questions each.`}
        </p>

        <button
          type="button"
          data-testid="arena-play-now"
          disabled={!session}
          onClick={() => setPlayScreen(true)}
          className="w-full rounded-lg border-0 p-3 text-center text-sm font-semibold"
          style={{
            background: t.primary,
            color: t.primaryFg,
            cursor: session ? 'pointer' : 'not-allowed',
            opacity: session ? 1 : 0.5,
            fontFamily: 'inherit',
          }}
        >
          Play now
        </button>
      </div>
    );
  }

  return (
    <div data-testid="arena-game">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="m-0 text-[13px] font-semibold" data-testid="arena-progress">
          Experiment {mode}
          <span style={{ color: t.mutedFg }}>
            {' '}
            · Clip {session.answered + 1} of {session.block.length}
          </span>
        </h1>
        <button
          type="button"
          data-testid="arena-show-instructions"
          onClick={() => setPlayScreen(false)}
          className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium underline-offset-2 hover:underline"
          style={{ color: t.mutedFg, fontFamily: 'inherit' }}
        >
          Instructions
        </button>
      </div>

      {showIntro && sentence ? (
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
      ) : (
        <ArenaRound
          key={roundId}
          clip={clip}
          sentence={sentence}
          participant={participant}
          session={session}
          alreadySubmitted={session.submitted === true}
          onSaved={markSubmitted}
          onNext={next}
        />
      )}
    </div>
  );
}

/** One question of a round: its survey wording, the picker rows and the key that picks each. */
interface Step {
  id: string;
  prompt: string;
  options: { value: string; label: string; hint: string }[];
  value: string | null;
  pick: (value: string) => void;
}

function ArenaRound({
  clip,
  sentence,
  participant,
  session,
  alreadySubmitted,
  onSaved,
  onNext,
}: {
  clip: ClipInfo;
  sentence: Exp2Sentence | null;
  participant: string;
  session: Session;
  alreadySubmitted: boolean;
  onSaved: (session: string, round: number) => void;
  onNext: () => void;
}) {
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    alreadySubmitted ? 'saved' : 'idle'
  );
  /** 'bars' = the loudness timeline; 'progress' = a plain progress bar (reduced motion, or no
   *  Web Audio). */
  const [meter, setMeter] = useState<'bars' | 'progress'>('bars');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Loudness measured for each slice of the clip, -1 where it has not been played yet. */
  const levels = useRef<Float32Array>(new Float32Array(BARS).fill(-1));
  const loud = useRef({ peak: 0, last: -1, lastRms: 0, wired: false });

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
  const canSubmit = completed && answered && !submitted;
  const canNext = step.value !== null;

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
      // A 200 {duplicate:true} means the server already holds this round: still "recorded".
      if (res.ok) onSaved(session.session, session.answered);
      setSaveState(res.ok ? 'saved' : 'failed');
    } catch {
      setSaveState('failed');
    }
  }, [exp, hai, question, interp, nat, participant, session, clip.file, onSaved]);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    audioRef.current?.pause();
    setSubmitted(true);
    void postResponse();
  }, [canSubmit, postResponse]);

  /** Next on every question but the last, Submit on the last. */
  const advance = useCallback(() => {
    if (submitted) return;
    if (isLast) submit();
    else if (canNext) setStepIndex((i) => i + 1);
  }, [submitted, isLast, canNext, submit]);

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
      } else if (!submitted) {
        const option = step.options.find((o) => o.hint.toLowerCase() === e.key.toLowerCase());
        if (option) step.pick(option.value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, advance, submitted, step]);

  const hint = !isLast || canSubmit ? '' : !canNext ? 'Pick an answer to submit.' : 'Play the clip to submit.';

  const smallButton = 'rounded-lg px-4 py-2 text-[13px] font-semibold';
  const primaryStyle = (enabled: boolean) => ({
    background: t.primary,
    color: t.primaryFg,
    border: `1px solid ${t.primary}`,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontFamily: 'inherit',
  });

  const nextClipButton = (
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
      <div
        className="mb-3 rounded-[10px] px-4 py-3"
        style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        data-testid="arena-clip"
        data-completed={completed ? 'true' : 'false'}
      >
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

      {!submitted && (
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
                Submit
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

      {submitted && (
        <div className="rounded-[10px] p-[22px] text-center" style={{ background: t.card, border: `1px solid ${t.border}` }}>
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
                {nextClipButton}
              </div>
            </>
          ) : (
            <>
              <div data-testid="arena-recorded" className="mb-4 text-[13.5px] font-semibold" style={{ color: t.mutedFg }}>
                {saveState === 'saving' ? 'Saving…' : 'Response recorded'}
              </div>
              {saveState !== 'saving' && nextClipButton}
            </>
          )}
        </div>
      )}
    </>
  );
}
