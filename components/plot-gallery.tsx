'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTheme } from '@/lib/theme';
import { PLOTS, plotSrc } from '@/lib/plots';
import type { Experiment } from '@/lib/models';

/** The acoustic plots for one experiment: pick a model (and a sentence), see that plot. */
export function PlotGallery({ experiment }: { experiment: Experiment }) {
  const { t } = useTheme();
  const set = PLOTS[experiment];
  const [picked, setPicked] = useState<string[]>(() => set.pickers.map((p) => p.options[0].id));
  const labels = set.pickers.map((p, i) => p.options.find((o) => o.id === picked[i])!.label);

  return (
    <div data-testid="plots">
      {set.pickers.map((picker, i) => (
        <div key={picker.label} className="mb-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label={picker.label}>
          <span className="mr-1 w-[62px] text-xs font-medium" style={{ color: t.mutedFg }}>
            {picker.label}
          </span>
          {picker.options.map((o) => {
            const active = picked[i] === o.id;
            return (
              <button
                key={o.id}
                type="button"
                data-testid={`plot-pick-${o.id}`}
                aria-pressed={active}
                onClick={() => setPicked((prev) => prev.map((id, j) => (j === i ? o.id : id)))}
                className="cursor-pointer rounded-md px-2.5 py-1 text-[12.5px] font-medium"
                style={{
                  fontFamily: 'inherit',
                  background: active ? t.primary : t.card,
                  color: active ? t.primaryFg : t.fg,
                  border: `1px solid ${active ? t.primary : t.border}`,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ))}
      {/* The plots are drawn on white, so the frame stays white in the dark theme too. */}
      <div
        className="mt-4 overflow-x-auto rounded-[10px] p-3"
        style={{ background: '#ffffff', border: `1px solid ${t.border}`, boxShadow: t.shadow }}
      >
        <Image
          data-testid="plot-image"
          src={plotSrc(experiment, picked)}
          alt={`${experiment === 1 ? 'Focus' : 'Boundary cue'} plot: ${labels.join(', ')}`}
          width={set.width}
          height={set.height}
          unoptimized
          style={{ display: 'block', width: '100%', minWidth: 640, height: 'auto' }}
        />
      </div>
    </div>
  );
}
