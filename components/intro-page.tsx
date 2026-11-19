'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { TextArt } from '@/components/text-art';
import { EXP1_SENTENCE, INTENDED_QUESTION, type Exp2Sentence } from '@/lib/experiments';
import { FOCUS_STOPS, fieldArt, focusArt, groupingArt, listenersArt, waveArt, type Art, type Avoid } from '@/lib/intro-art';

const HEADER = 56; // px, the strip at the top where the site's floating controls sit
const FOCUS_STEP = 1; // index of the Focus step, the only scroll-driven one
/** The Focus step is this many screens tall: its card pins to the top while the reader scrolls
 *  the stress from word to word. */
const FOCUS_SCREENS = 4;
const FOCUS_CARD_TOP = 16; // px between the header and the pinned Focus card
/** Share of a screen left empty at the end of the Focus step, so its card has scrolled away
 *  by the time the next step's background takes over. */
const FOCUS_TAIL = 0.5;

/** The intro's scrollytelling: full-viewport steps over pinned text-art backgrounds that
 *  crossfade as each step enters. */
export function IntroPage({ sentence, breakA, breakB }: { sentence: Exp2Sentence; breakA: number; breakB: number }) {
  const { t } = useTheme();
  const words = useMemo(() => sentence.text.replace(/\.$/, '').split(' '), [sentence.text]);
  const arts: Art[] = useMemo(
    () => [fieldArt, focusArt, groupingArt({ words, breakA, breakB }), waveArt, listenersArt],
    [words, breakA, breakB]
  );

  const [active, setActive] = useState(0);
  const [fading, setFading] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<number>>(() => new Set([0]));
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const steps = useRef<(HTMLElement | null)[]>([]);
  const prevActive = useRef(0);
  const pinned = useRef<HTMLDivElement | null>(null);
  const focusCard = useRef<HTMLDivElement | null>(null);
  const focusSection = useRef<HTMLElement | null>(null);
  /** The band the pinned Focus card covers at the top of the art, so the focus art can set its
   *  words below the card instead of behind it. */
  const [focusAvoid, setFocusAvoid] = useState<Avoid | null>(null);
  /** Scroll progress through the Focus step while its card is pinned, 0–1. */
  const [focusProgress, setFocusProgress] = useState(0);

  useEffect(() => {
    const box = pinned.current;
    const card = focusCard.current;
    if (!box || !card) return;
    const MARGIN = 10;
    const update = () => {
      const h = box.clientHeight;
      // The art is pinned to the top of the screen; the card sits below the floating controls.
      const bottom = Math.min(h, HEADER + FOCUS_CARD_TOP + card.offsetHeight + MARGIN);
      // The pinned box can be taller than what is on screen (100svh vs. the current viewport).
      const end = Math.min(h, window.innerHeight);
      setFocusAvoid((prev) => (prev && prev.bottom === bottom && prev.end === end ? prev : { top: 0, bottom, end }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(card);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // The Focus step's stress follows the scroll position, and nothing else: no timer.
  useEffect(() => {
    const section = focusSection.current;
    const card = focusCard.current;
    if (!section || !card) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tail = parseFloat(getComputedStyle(section).paddingBottom) || 0;
      // From the card pinning under the header to the card letting go at the end of the step.
      const range = section.offsetHeight - tail - FOCUS_CARD_TOP - card.offsetHeight;
      const scrolled = HEADER - section.getBoundingClientRect().top;
      const p = range > 0 ? Math.max(0, Math.min(1, scrolled / range)) : 0;
      setFocusProgress(Math.round(p * 400) / 400);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser state after mount */
    update();
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Which step is centred (drives the background), and which steps have been revealed.
  useEffect(() => {
    const centre = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    const reveal = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.step));
        if (hit.length) setShown((s) => new Set([...s, ...hit]));
      },
      { threshold: 0.3 }
    );
    // The tall Focus step never has 30% of itself on screen: the same share of one screen.
    const revealTall = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((s) => new Set([...s, FOCUS_STEP]));
      },
      { threshold: 0.3 / FOCUS_SCREENS }
    );
    steps.current.forEach((el, i) => {
      if (!el) return;
      centre.observe(el);
      (i === FOCUS_STEP ? revealTall : reveal).observe(el);
    });
    // Pause all animation while the story is scrolled out of view (e.g. at the footer).
    const whole = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    if (wrapper.current) whole.observe(wrapper.current);
    return () => {
      centre.disconnect();
      reveal.disconnect();
      revealTall.disconnect();
      whole.disconnect();
    };
  }, []);

  // Keep the outgoing background animating through its crossfade.
  useEffect(() => {
    if (prevActive.current === active) return;
    const prev = prevActive.current;
    prevActive.current = active;
    setFading(prev);
    const id = window.setTimeout(() => setFading(null), 1100);
    return () => window.clearTimeout(id);
  }, [active]);

  // The ending reuses the opening field.
  const artFor = (step: number) => (step >= arts.length ? 0 : step);
  const activeArt = artFor(active);
  const fadingArt = fading === null ? null : artFor(fading);
  const motion = !reduced;
  // With reduced motion the stress jumps from word to word instead of travelling.
  const focusAt = reduced
    ? Math.round(focusProgress * (FOCUS_STOPS.length - 1)) / (FOCUS_STOPS.length - 1)
    : focusProgress;
  const backdrop = `${t.bg}e0`;

  const reveal = (i: number) => {
    const visible = !ready || reduced || shown.has(i);
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(28px)',
      transition: motion ? 'opacity 700ms ease, transform 700ms ease' : 'none',
    };
  };

  const strong = (s: string) => <b style={{ color: t.fg }}>{s}</b>;

  const story: { kicker: string; title: string; body: ReactNode }[] = [
    {
      kicker: 'Meaning beyond words',
      title: 'The same words can mean different things.',
      body: <p>What a sentence means depends not only on its words, but on how they are said.</p>,
    },
    {
      kicker: 'Focus',
      title: EXP1_SENTENCE,
      body: (
        <>
          <p>The emphasized word tells the listener which question the sentence answers.</p>
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5">
            <li>
              {strong('MOLLY')} mailed a melon. → &ldquo;{INTENDED_QUESTION.molly}&rdquo;
            </li>
            <li>
              Molly {strong('MAILED')} a melon. → &ldquo;{INTENDED_QUESTION.mailed}&rdquo;
            </li>
            <li>
              Molly mailed {strong('A')} melon. → &ldquo;{INTENDED_QUESTION.a}&rdquo;
            </li>
            <li>
              Molly mailed a {strong('MELON')}. → &ldquo;{INTENDED_QUESTION.melon}&rdquo;
            </li>
          </ul>
        </>
      ),
    },
    {
      kicker: 'Ambiguity',
      title: sentence.text,
      body: (
        <>
          <p>One sentence, two readings. How the speaker groups the words, and where they pause, decides which is meant.</p>
          <ul className="mt-3 flex list-none flex-col gap-1 p-0">
            <li>
              {strong('A:')} {sentence.optionA}
            </li>
            <li>
              {strong('B:')} {sentence.optionB}
            </li>
          </ul>
        </>
      ),
    },
    {
      kicker: 'The question',
      title: 'People do this effortlessly. Can speech models?',
      body: <p>Text-to-speech and speech-to-speech models sound fluent. Do they also put the emphasis and grouping where the meaning needs it?</p>,
    },
    {
      kicker: 'How we test them',
      title: 'Listeners judge what the speech means.',
      body: (
        <p>
          Listeners hear speech produced by each model and say which question it answers (Experiment 1) or which
          reading the speaker intended (Experiment 2). They also rate how natural it sounds.
        </p>
      ),
    },
  ];

  const stepHeight = '100svh';

  return (
    <div ref={wrapper} className="relative" data-testid="intro">
      {/* Pinned background: every art layer stacked, the active one visible. */}
      <div ref={pinned} className="sticky overflow-hidden" style={{ top: 0, height: stepHeight }} aria-hidden="true">
        {arts.map((art, i) => {
          const on = i === activeArt;
          return (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                opacity: on ? 1 : 0,
                transform: on || !motion ? 'none' : 'scale(1.06)',
                transition: motion ? 'opacity 900ms ease, transform 1200ms ease' : 'none',
              }}
            >
              <TextArt
                art={art}
                testId={`intro-art-${i + 1}`}
                reduced={reduced}
                running={ready && inView && (i === activeArt || i === fadingArt)}
                avoid={i === FOCUS_STEP ? focusAvoid : null}
                at={i === FOCUS_STEP ? focusAt : null}
              />
            </div>
          );
        })}
      </div>

      <div className="relative" style={{ marginTop: `calc(-1 * ${stepHeight})` }}>
        {story.map((s, i) => (
          <section
            key={i}
            ref={(el) => {
              steps.current[i] = el;
              if (i === FOCUS_STEP) focusSection.current = el;
            }}
            data-step={i}
            data-testid={`intro-step-${i + 1}`}
            className={`flex px-4 sm:px-6 ${i === FOCUS_STEP ? 'items-start' : 'items-center'}`}
            style={
              i === FOCUS_STEP
                ? {
                    boxSizing: 'border-box',
                    minHeight: `calc(${FOCUS_SCREENS} * ${stepHeight})`,
                    paddingTop: FOCUS_CARD_TOP,
                    paddingBottom: `calc(${FOCUS_TAIL} * ${stepHeight})`,
                  }
                : { minHeight: stepHeight }
            }
          >
            <div
              ref={
                i === FOCUS_STEP
                  ? (el) => {
                      focusCard.current = el;
                    }
                  : undefined
              }
              data-testid={`intro-card-${i + 1}`}
              className={`mx-auto w-full max-w-[580px] rounded-xl px-5 py-6 sm:px-7 ${i === FOCUS_STEP ? 'sticky' : ''}`}
              style={{
                background: backdrop,
                ...reveal(i),
                ...(i === FOCUS_STEP ? { top: HEADER + FOCUS_CARD_TOP } : null),
              }}
            >
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.mutedFg }}>
                {s.kicker}
              </div>
              <h2 className="mb-3 text-[24px] font-semibold leading-tight tracking-tight sm:text-[30px]" style={{ margin: '0 0 12px' }}>
                {s.title}
              </h2>
              <div className="text-[15px] leading-[1.6]" style={{ color: t.mutedFg }}>
                {s.body}
              </div>
            </div>
          </section>
        ))}

        <section
          ref={(el) => {
            steps.current[story.length] = el;
          }}
          data-step={story.length}
          data-testid="intro-ending"
          className="flex items-center px-4 sm:px-6"
          style={{ minHeight: stepHeight }}
        >
          <div
            className="mx-auto flex w-full max-w-[580px] flex-wrap justify-center gap-3 rounded-xl px-5 py-6"
            style={{ background: backdrop, ...reveal(story.length) }}
          >
            <Link
              href="/leaderboard"
              data-testid="intro-cta-leaderboard"
              className="rounded-lg px-[22px] py-[11px] text-[14px] font-semibold no-underline"
              style={{ background: t.primary, color: t.primaryFg }}
            >
              See the leaderboard
            </Link>
            <Link
              href="/arena"
              data-testid="intro-cta-arena"
              className="rounded-lg px-[22px] py-[11px] text-[14px] font-semibold no-underline"
              style={{ border: `1px solid ${t.border}`, color: t.fg, background: t.card }}
            >
              Try the arena
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
