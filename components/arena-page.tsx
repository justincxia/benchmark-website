'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import type { Experiment } from '@/lib/models';
import { buildBlock, type ClipInfo } from '@/lib/clips';
import type { Exp2Sentence } from '@/lib/experiments';
import { TrialPlayer, type TrialAnswers, type TrialTiming } from '@/components/trial-player';

const PARTICIPANT_KEY = 'arena_participant';
const MODE_KEY = 'arena_mode';
/** sessionStorage: Play now was pressed during this visit, so the instructions stay hidden. */
const STARTED_KEY = 'arena_started';
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

/** One round of the arena: the shared play screen, plus saving the response and the
 *  "Response recorded" / Retry / Next clip panel that replaces the questions. */
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    alreadySubmitted ? 'saved' : 'idle'
  );
  /** The submitted answers, kept for Retry. */
  const lastRef = useRef<{ answers: TrialAnswers; timing: TrialTiming } | null>(null);

  const postResponse = useCallback(async () => {
    const last = lastRef.current;
    if (!last) return;
    setSaveState('saving');
    const { answers, timing } = last;
    const fields =
      answers.experiment === 1
        ? { humanOrAi: answers.humanOrAi, questionAnswered: answers.questionAnswered }
        : { interpretation: answers.interpretation };
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
          naturalness: answers.naturalness,
          ...fields,
          listenedMs: timing.listenedMs,
        }),
      });
      // A 200 {duplicate:true} means the server already holds this round: still "recorded".
      if (res.ok) onSaved(session.session, session.answered);
      setSaveState(res.ok ? 'saved' : 'failed');
    } catch {
      setSaveState('failed');
    }
  }, [participant, session, clip.file, onSaved]);

  const onSubmit = useCallback(
    (answers: TrialAnswers, timing: TrialTiming) => {
      lastRef.current = { answers, timing };
      void postResponse();
    },
    [postResponse]
  );

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

  const submittedView = (
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
  );

  return (
    <TrialPlayer
      clip={clip}
      sentence={sentence}
      onSubmit={onSubmit}
      alreadySubmitted={alreadySubmitted}
      submittedView={submittedView}
    />
  );
}
