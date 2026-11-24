'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import type { ClipInfo } from '@/lib/clips';
import { ARENA_INSTRUCTIONS } from '@/lib/arena-instructions';
import { consentSections, SONA_CONTACT_EMAIL } from '@/lib/sona-consent';
import {
  backoffMs,
  SONA_PENDING_KEY,
  SONA_STATE_KEY,
  SONA_TRIALS,
  validateContact,
  volumeCheckClip,
} from '@/lib/sona';
import { toneWav } from '@/lib/wav';
import { clipSrc, TrialPlayer, type TrialAnswers, type TrialTiming } from '@/components/trial-player';

/** Where a consented participant is. Before consent nothing is stored or sent. */
type Stage = 'instructions' | 'trials' | 'contact' | 'done';

/** The survey's progress, kept in localStorage (SONA_STATE_KEY) so a reload resumes it. */
interface Stored {
  sessionId: string;
  /** Clip basenames in play order, as the server drew them (50, or 3 in debug). */
  block: string[];
  /** The clip on screen (stage 'trials'): the number of clips answered so far. */
  index: number;
  stage: Stage;
  debug: boolean;
  sonaId: string | null;
  /** Where to send the participant after the thank-you screen. Handed back by
   *  /api/sona/complete only once the session is complete, so the SONA credit link never
   *  appears in the page before then. */
  redirect?: string | null;
}

/** An answer not yet confirmed saved by the server (SONA_PENDING_KEY). */
interface Pending {
  sessionId: string;
  trialIndex: number;
  clip: string;
  naturalness: number;
  humanOrAi: string;
  questionAnswered: string;
  listenedMs: number;
  responseMs: number;
}

type Fatal = { kind: 'mismatch' } | { kind: 'rejected'; detail: string };

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the survey lives for this page view only.
  }
}

function validStored(s: unknown): s is Stored {
  if (typeof s !== 'object' || s === null) return false;
  const v = s as Stored;
  return (
    typeof v.sessionId === 'string' &&
    v.sessionId !== '' &&
    Array.isArray(v.block) &&
    v.block.length > 0 &&
    v.block.every((f) => typeof f === 'string') &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index < v.block.length &&
    ['instructions', 'trials', 'contact', 'done'].includes(v.stage) &&
    typeof v.debug === 'boolean' &&
    (v.sonaId === null || typeof v.sonaId === 'string') &&
    (v.redirect === undefined || v.redirect === null || typeof v.redirect === 'string')
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function SonaSurveyPage({
  clips,
  manifestError,
  minutes,
}: {
  clips: ClipInfo[];
  manifestError: string | null;
  /** "About N minutes" on the consent form, computed on the server from the clips' durations. */
  minutes: number;
}) {
  const { t } = useTheme();
  const byFile = useMemo(() => new Map(clips.map((c) => [c.file, c])), [clips]);

  /** false until localStorage has been read (nothing renders before, so no flash). */
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<Stored | null>(null);
  const [declined, setDeclined] = useState(false);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  /** Unsaved answers. The ref is the source of truth for the save loop; the count renders. */
  const pendingRef = useRef<Pending[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  /** A save failed and is being retried. */
  const [retrying, setRetrying] = useState(false);
  /** The ?id= and ?debug=1 of the page address, read on mount. */
  const urlRef = useRef<{ sonaId: string | null; debug: boolean }>({ sonaId: null, debug: false });
  const fatalRef = useRef<Fatal | null>(null);
  const flushRef = useRef<Promise<void> | null>(null);

  const fail = useCallback((f: Fatal) => {
    fatalRef.current = f;
    setFatal(f);
  }, []);

  const commit = useCallback((s: Stored | null) => {
    writeJson(SONA_STATE_KEY, s);
    setStored(s);
  }, []);

  const setPending = useCallback((list: Pending[]) => {
    pendingRef.current = list;
    writeJson(SONA_PENDING_KEY, list.length ? list : null);
    setPendingCount(list.length);
  }, []);

  /** Sends every pending answer, oldest first, retrying network/server failures with
   *  exponential backoff. One loop at a time: a second call returns the running loop. */
  const flush = useCallback((): Promise<void> => {
    if (flushRef.current) return flushRef.current;
    const run = async () => {
      let attempt = 0;
      while (pendingRef.current.length > 0 && !fatalRef.current) {
        const item = pendingRef.current[0];
        let status = 0;
        try {
          const res = await fetch('/api/sona/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(item),
          });
          status = res.status;
        } catch {
          status = 0;
        }
        if (status === 200 || status === 201) {
          // 200 {duplicate:true}: the server already holds this trial.
          setPending(pendingRef.current.filter((p) => p.trialIndex !== item.trialIndex || p.sessionId !== item.sessionId));
          attempt = 0;
          setRetrying(false);
          continue;
        }
        if (status === 400 || status === 404 || status === 409) {
          // Retrying cannot help. The answer stays in localStorage; the participant is told
          // whom to contact.
          fail({ kind: 'rejected', detail: `An answer was refused by the server (${status}).` });
          break;
        }
        setRetrying(true);
        await sleep(backoffMs(attempt));
        attempt++;
      }
    };
    const p = run().finally(() => {
      flushRef.current = null;
    });
    flushRef.current = p;
    return p;
  }, [fail, setPending]);

  // Mount-only: localStorage and the page address can't be read during render without breaking
  // hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    urlRef.current = { sonaId: params.get('id'), debug: params.get('debug') === '1' };
    const s = readJson<unknown>(SONA_STATE_KEY);
    const rawPending = readJson<unknown>(SONA_PENDING_KEY);
    const pending = Array.isArray(rawPending) ? (rawPending as Pending[]) : [];
    pendingRef.current = pending;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setPendingCount(pending.length);
    if (validStored(s)) {
      // A clip that has left the corpus can't be played or saved: say so rather than silently
      // starting over (the participant's earlier answers are already on the server).
      const known = new Set(clips.filter((c) => c.experiment === 1).map((c) => c.file));
      if (s.stage !== 'done' && !s.block.every((f) => known.has(f))) fail({ kind: 'mismatch' });
      setStored(s);
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (pending.length) void flush();
  }, [clips, fail, flush]);

  if (manifestError) {
    return (
      <Card testId="sona-unavailable">
        <div className="mb-2 font-semibold" style={{ color: t.fg }}>
          The study is unavailable right now
        </div>
        <div style={{ color: t.mutedFg }}>
          Please try again later, or write to {SONA_CONTACT_EMAIL}. ({manifestError})
        </div>
      </Card>
    );
  }

  if (!loaded) return <div style={{ minHeight: 320 }} />;

  const debugBadge = stored?.debug ? (
    <div
      data-testid="sona-debug-session"
      className="fixed bottom-2 right-2 z-50 truncate rounded px-2 py-1 text-[10.5px]"
      style={{ background: t.muted, color: t.mutedFg, border: `1px solid ${t.border}`, maxWidth: 'calc(100vw - 16px)' }}
    >
      debug session {stored.sessionId}
    </div>
  ) : null;

  if (fatal) {
    return (
      <Card testId="sona-error">
        <div className="mb-2 font-semibold" style={{ color: t.fg }}>
          Something went wrong with your session
        </div>
        <p className="m-0" style={{ color: t.mutedFg }}>
          {fatal.kind === 'mismatch'
            ? 'The recordings for your session have changed since you started, so the study cannot continue in this browser.'
            : fatal.detail}{' '}
          Please don&apos;t start again: write to {SONA_CONTACT_EMAIL} and include this code so we can credit you:{' '}
          <code data-testid="sona-error-session">{stored?.sessionId ?? 'none'}</code>.
        </p>
        {debugBadge}
      </Card>
    );
  }

  if (!stored) {
    if (declined) {
      return (
        <Card testId="sona-declined">
          <div className="mb-2 font-semibold" style={{ color: t.fg }}>
            You chose not to take part
          </div>
          <p className="m-0" style={{ color: t.mutedFg }}>
            Nothing has been recorded. You can close this page.
          </p>
        </Card>
      );
    }
    return (
      <Consent
        minutes={minutes}
        onDecline={() => {
          setDeclined(true);
          window.scrollTo(0, 0);
        }}
        onSession={(sessionId, block, debug) => {
          commit({ sessionId, block, index: 0, stage: 'instructions', debug, sonaId: urlRef.current.sonaId });
          window.scrollTo(0, 0);
        }}
        urlRef={urlRef}
      />
    );
  }

  const n = stored.block.length;

  if (stored.stage === 'instructions') {
    return (
      <>
        <Instructions
          trials={n}
          volumeClip={volumeCheckClip(clips)}
          onStart={() => {
            commit({ ...stored, stage: 'trials', index: 0 });
            window.scrollTo(0, 0);
          }}
        />
        {debugBadge}
      </>
    );
  }

  if (stored.stage === 'trials') {
    const clip = byFile.get(stored.block[stored.index]);
    if (!clip) return null; // unreachable: the block was checked against the manifest on load
    const nextClip = stored.index + 1 < n ? byFile.get(stored.block[stored.index + 1]) : undefined;
    const onSubmit = (answers: TrialAnswers, timing: TrialTiming) => {
      if (answers.experiment !== 1) return;
      const item: Pending = {
        sessionId: stored.sessionId,
        trialIndex: stored.index,
        clip: clip.file,
        naturalness: answers.naturalness,
        humanOrAi: answers.humanOrAi,
        questionAnswered: answers.questionAnswered,
        listenedMs: Math.max(0, Math.round(timing.listenedMs)),
        responseMs: Math.max(0, Math.round(timing.responseMs)),
      };
      // The answer is in localStorage before the survey moves on, so it survives a reload or a
      // failed request; the save loop sends it in the background.
      setPending([...pendingRef.current.filter((p) => p.trialIndex !== item.trialIndex), item]);
      const last = stored.index + 1 >= n;
      commit(last ? { ...stored, stage: 'contact' } : { ...stored, index: stored.index + 1 });
      window.scrollTo(0, 0);
      void flush();
    };
    const header = (
      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-3">
          <h1 className="m-0 text-[13px] font-semibold" data-testid="sona-progress">
            Clip {stored.index + 1} of {n}
          </h1>
          {retrying && pendingCount > 0 && (
            <span data-testid="sona-saving" className="ml-auto text-[11.5px] font-medium" style={{ color: t.mutedFg }}>
              Saving…
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Survey progress"
          aria-valuemin={0}
          aria-valuemax={n}
          aria-valuenow={stored.index}
          data-testid="sona-progress-bar"
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: t.muted }}
        >
          <div className="h-full rounded-full" style={{ width: `${(stored.index / n) * 100}%`, background: t.primary }} />
        </div>
      </div>
    );
    return (
      <div data-testid="sona-trials">
        <TrialPlayer
          key={`${stored.sessionId}:${stored.index}`}
          clip={clip}
          header={header}
          onSubmit={onSubmit}
          preloadSrc={nextClip ? clipSrc(nextClip) : undefined}
        />
        {debugBadge}
      </div>
    );
  }

  if (stored.stage === 'contact') {
    return (
      <>
        <ContactForm
          saving={pendingCount > 0}
          retrying={retrying}
          onSubmit={async (contact) => {
            // Every answer must be on the server before the session can be completed.
            while (pendingRef.current.length > 0 && !fatalRef.current) await flush();
            if (fatalRef.current) return 'fatal';
            let res: Response;
            try {
              res = await fetch('/api/sona/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: stored.sessionId, ...contact }),
              });
            } catch {
              return 'Could not reach the server. Please check your connection and try again.';
            }
            if (res.ok) {
              const done = (await res.json().catch(() => null)) as { redirect?: unknown } | null;
              const redirect = typeof done?.redirect === 'string' ? done.redirect : null;
              commit({ ...stored, stage: 'done', redirect });
              window.scrollTo(0, 0);
              return null;
            }
            if (res.status === 400) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              return body?.error ?? 'Please check your name and email.';
            }
            if (res.status === 404 || res.status === 409) {
              fail({ kind: 'rejected', detail: `Your session could not be completed (${res.status}).` });
              return 'fatal';
            }
            return 'Something went wrong on our side. Please try again in a moment.';
          }}
        />
        {debugBadge}
      </>
    );
  }

  return (
    <>
      <ThankYou redirect={stored.redirect ?? null} />
      {debugBadge}
    </>
  );
}

function Card({ testId, children }: { testId?: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <div
      data-testid={testId}
      className="rounded-[10px] px-5 py-[18px] text-[13.5px] leading-[1.6]"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  testId,
  disabled = false,
  onClick,
  type = 'button',
  children,
}: {
  testId: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: ReactNode;
}) {
  const { t } = useTheme();
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg border-0 p-3 text-center text-sm font-semibold"
      style={{
        background: t.primary,
        color: t.primaryFg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function Consent({
  minutes,
  onDecline,
  onSession,
  urlRef,
}: {
  minutes: number;
  onDecline: () => void;
  onSession: (sessionId: string, block: string[], debug: boolean) => void;
  urlRef: { current: { sonaId: string | null; debug: boolean } };
}) {
  const { t } = useTheme();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sona/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sonaId: urlRef.current.sonaId, debug: urlRef.current.debug }),
      });
      const body = (await res.json().catch(() => null)) as { sessionId?: string; block?: string[]; debug?: boolean } | null;
      if (!res.ok || !body?.sessionId || !Array.isArray(body.block) || body.block.length === 0) {
        setError(`The study could not be started (${res.status}). Please try again, or write to ${SONA_CONTACT_EMAIL}.`);
        setBusy(false);
        return;
      }
      onSession(body.sessionId, body.block, body.debug === true);
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div data-testid="sona-consent">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Consent to take part in a research study
      </h1>
      <p className="text-sm" style={{ margin: '0 0 18px', color: t.mutedFg }}>
        Please read this form before deciding whether to take part.
      </p>
      <Card>
        {consentSections(minutes, SONA_TRIALS).map((s) => (
          <section key={s.title} className="mb-3.5 last:mb-0">
            <h2 className="m-0 mb-1 text-[14px] font-semibold">{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="m-0 mb-1.5 last:mb-0" style={{ color: t.mutedFg }}>
                {p}
              </p>
            ))}
          </section>
        ))}
      </Card>

      <label className="mt-5 mb-4 flex cursor-pointer items-start gap-2.5 text-[13.5px] font-medium">
        <input
          type="checkbox"
          data-testid="sona-consent-check"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-[3px] h-4 w-4 shrink-0"
        />
        I am 18 or older and agree to participate
      </label>
      {error && (
        <p data-testid="sona-consent-error" className="mb-3 text-[13px]" style={{ color: t.danger }}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <PrimaryButton testId="sona-agree" disabled={!checked || busy} onClick={() => void agree()}>
          {busy ? 'Starting…' : 'I agree'}
        </PrimaryButton>
        <button
          type="button"
          data-testid="sona-decline"
          disabled={busy}
          onClick={onDecline}
          className="w-full cursor-pointer rounded-lg bg-transparent p-3 text-center text-sm font-semibold"
          style={{ border: `1px solid ${t.border}`, color: t.fg, fontFamily: 'inherit' }}
        >
          I do not agree
        </button>
      </div>
    </div>
  );
}

function Instructions({
  trials,
  volumeClip,
  onStart,
}: {
  trials: number;
  volumeClip: ClipInfo | null;
  onStart: () => void;
}) {
  const { t } = useTheme();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);

  const play = () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    // No Experiment 2 recording to use: a generated 1 s tone instead.
    if (!a.getAttribute('src')) {
      const bytes = toneWav(1);
      a.src = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
    }
    a.currentTime = 0;
    void a.play().catch(() => setPlaying(false));
  };

  return (
    <div data-testid="sona-instructions">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 18px' }}>
        Instructions
      </h1>
      <div className="mb-5">
        <Card>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5" style={{ color: t.mutedFg }}>
            {ARENA_INSTRUCTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="m-0 mt-3" style={{ color: t.mutedFg }}>
            Focus: {trials} recordings of one sentence, three questions each.
          </p>
        </Card>
      </div>

      <div className="mb-5">
        <Card testId="sona-volume-check">
          <div className="mb-1 font-semibold">Audio check</div>
          <p className="m-0 mb-3" style={{ color: t.mutedFg }}>
            Put on your headphones and play this sample. Set your volume so it is clear and comfortable. The sample is
            not one of the recordings you will rate.
          </p>
          <audio
            ref={audioRef}
            data-testid="sona-volume-audio"
            src={volumeClip ? clipSrc(volumeClip) : undefined}
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setHeard(true);
            }}
          />
          <button
            type="button"
            data-testid="sona-volume-play"
            onClick={play}
            className="cursor-pointer rounded-lg bg-transparent px-[18px] py-[9px] text-[13.5px] font-semibold"
            style={{ border: `1px solid ${t.border}`, color: t.fg, fontFamily: 'inherit' }}
          >
            {playing ? 'Pause' : heard ? 'Play again' : 'Play sample'}
          </button>
        </Card>
      </div>

      <PrimaryButton testId="sona-start" disabled={!heard} onClick={onStart}>
        {heard ? 'Start' : 'Play the sample to continue'}
      </PrimaryButton>
    </div>
  );
}

function ContactForm({
  saving,
  retrying,
  onSubmit,
}: {
  /** Answers are still being sent. */
  saving: boolean;
  retrying: boolean;
  /** Resolves to an error message to show, 'fatal' (the page shows its error screen), or null. */
  onSubmit: (contact: { name: string; email: string }) => Promise<string | null>;
}) {
  const { t } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateContact({ name, email });
    if ('error' in v) {
      setError(v.error);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await onSubmit(v.value);
    if (result !== null && result !== 'fatal') {
      setError(result);
      setBusy(false);
    }
  };

  const input = 'w-full rounded-lg px-3 py-2.5 text-[14px] outline-none';
  const inputStyle = { border: `1px solid ${t.input}`, background: t.card, color: t.fg, fontFamily: 'inherit' };

  return (
    <form
      data-testid="sona-contact"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Almost done
      </h1>
      <p className="text-sm" style={{ margin: '0 0 18px', color: t.mutedFg }}>
        Please enter your name and email address so we can [TO FILL: credit/follow-up].
      </p>
      <Card>
        <label className="mb-3 block">
          <span className="mb-1 block font-semibold">Name</span>
          <input
            data-testid="sona-name"
            className={input}
            style={inputStyle}
            autoComplete="name"
            maxLength={200}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">Email</span>
          <input
            data-testid="sona-email"
            type="email"
            className={input}
            style={inputStyle}
            autoComplete="email"
            maxLength={320}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <p className="m-0 mt-3 text-[12.5px]" style={{ color: t.mutedFg }} data-testid="sona-contact-note">
          Your name and email are stored separately from your answers.
        </p>
      </Card>
      {error && (
        <p data-testid="sona-contact-error" className="mt-3 mb-0 text-[13px]" style={{ color: t.danger }}>
          {error}
        </p>
      )}
      {saving && (busy || retrying) && (
        <p data-testid="sona-saving" className="mt-3 mb-0 text-[12.5px]" style={{ color: t.mutedFg }}>
          Saving your answers…
        </p>
      )}
      <div className="mt-4">
        <PrimaryButton testId="sona-contact-submit" type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit'}
        </PrimaryButton>
      </div>
    </form>
  );
}

function ThankYou({ redirect }: { redirect: string | null }) {
  const { t } = useTheme();
  useEffect(() => {
    if (!redirect) return;
    // Long enough to read the confirmation.
    const id = setTimeout(() => window.location.assign(redirect), 2500);
    return () => clearTimeout(id);
  }, [redirect]);
  return (
    <Card testId="sona-thanks">
      <div className="mb-2 text-[17px] font-semibold" style={{ color: t.fg }}>
        Thank you!
      </div>
      <p className="m-0" style={{ color: t.mutedFg }}>
        Your responses have been recorded.{' '}
        {redirect ? (
          <span data-testid="sona-redirect">
            Taking you back to SONA to grant your credit… If nothing happens, <a href={redirect}>continue to SONA</a>.
          </span>
        ) : (
          'You can close this page.'
        )}
      </p>
    </Card>
  );
}
