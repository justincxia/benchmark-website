'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';
import { WAVE, waveImage } from '@/lib/wave';

/**
 * A sound wave behind the page: a band of bars fixed at mid-height of the window that slides
 * to the right as the page scrolls down and back to the left as it scrolls up. It sits under
 * the content, so it only shows through the gaps between cards. Decorative only.
 */
export function WaveBackground() {
  const { t } = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Scroll-linked movement is still movement: hold the wave still for reduced motion.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.backgroundPositionX = `${Math.round(window.scrollY * WAVE.speed)}px`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-testid="wave-bg"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: WAVE.height,
        transform: 'translateY(-50%)',
        backgroundImage: waveImage(t.border),
        backgroundRepeat: 'repeat-x',
        backgroundPositionX: 0,
        backgroundPositionY: 'center',
      }}
    />
  );
}
