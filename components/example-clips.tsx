'use client';

import { useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';

export interface ExampleClip {
  key: string;
  name: string;
  /** Clip basename served by /api/audio, or null when it is not in AUDIO_DIR. */
  file: string | null;
}

/** One playable example per model. */
export function ExampleClips({ clips, caption }: { clips: ExampleClip[]; caption: string }) {
  const { t } = useTheme();
  return (
    <section className="mt-10">
      <h2 className="mb-1.5 text-[19px] font-semibold tracking-tight">Example clips</h2>
      <p className="mb-4 text-[13.5px]" style={{ margin: '0 0 16px', color: t.mutedFg }}>
        {caption}
      </p>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {clips.map((c) => (
          <ClipCard key={c.key} clip={c} />
        ))}
      </div>
    </section>
  );
}

function ClipCard({ clip }: { clip: ExampleClip }) {
  const { t } = useTheme();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    if (a.ended) a.currentTime = 0;
    void a.play().catch(() => setPlaying(false));
  };

  return (
    <div
      data-testid={`example-${clip.key}`}
      className="flex items-center gap-3 rounded-[10px] px-4 py-3"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
    >
      {clip.file ? (
        <>
          <audio
            ref={ref}
            src={`/api/audio/${encodeURIComponent(clip.file)}`}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <button
            type="button"
            onClick={toggle}
            aria-label={`Play ${clip.name}`}
            className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-0"
            style={{ background: t.primary, color: t.primaryFg }}
          >
            <span className="text-xs leading-none">{playing ? '❚❚' : '▶'}</span>
          </button>
        </>
      ) : (
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs"
          style={{ border: `1px solid ${t.border}`, color: t.mutedFg }}
          title="Audio unavailable"
        >
          –
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold tracking-tight">{clip.name}</div>
        {!clip.file && (
          <div className="text-xs" style={{ color: t.mutedFg }}>
            Audio unavailable
          </div>
        )}
      </div>
    </div>
  );
}
