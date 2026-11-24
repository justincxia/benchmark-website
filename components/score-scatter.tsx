'use client';

import { useTheme } from '@/lib/theme';
import { MONO } from '@/lib/mono';
import { METRICS, type MetricKey, type MetricRow } from '@/lib/metrics';
import { axisFor, placeLabels } from '@/lib/scatter';

const W = 600;
const H = 340;
const PLOT = { x: 62, y: 16, w: W - 62 - 20, h: H - 16 - 52 };

/**
 * One metric against another: a labelled point per model that has both values. The axes
 * are fitted to the data rather than starting at zero, so the spread between models shows.
 */
export function ScoreScatter({ rows, x, y }: { rows: MetricRow[]; x: MetricKey; y: MetricKey }) {
  const { t } = useTheme();
  const xDef = METRICS.find((m) => m.key === x)!;
  const yDef = METRICS.find((m) => m.key === y)!;
  const models = rows.filter((r) => r.metrics[x].value !== null && r.metrics[y].value !== null);
  if (models.length === 0) return null;

  const step = (kind: 'pct' | 'mean') => (kind === 'pct' ? 0.05 : 0.25);
  const tick = (kind: 'pct' | 'mean', v: number) => (kind === 'pct' ? `${Math.round(v * 100)}%` : v.toFixed(2));
  const ax = axisFor(models.map((r) => r.metrics[x].value as number), step(xDef.kind));
  const ay = axisFor(models.map((r) => r.metrics[y].value as number), step(yDef.kind));
  const px = (v: number) => PLOT.x + ((v - ax.min) / (ax.max - ax.min)) * PLOT.w;
  const py = (v: number) => PLOT.y + PLOT.h - ((v - ay.min) / (ay.max - ay.min)) * PLOT.h;

  const points = models.map((r) => ({
    row: r,
    x: px(r.metrics[x].value as number),
    y: py(r.metrics[y].value as number),
    text: r.name,
  }));
  const labels = placeLabels(points, PLOT);

  return (
    <figure
      data-testid="scatter"
      className="mt-4 rounded-[10px] px-[22px] py-[18px]"
      style={{ margin: '16px 0 0', maxWidth: 640, background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
    >
      <figcaption className="mb-2 text-sm font-semibold tracking-tight">
        {xDef.label} against {yDef.label.toLowerCase()}
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${xDef.label} against ${yDef.label.toLowerCase()}, one point per model`}
          style={{ display: 'block', width: '100%', minWidth: 480, height: 'auto' }}
        >
          {ay.ticks.map((v) => (
            <g key={`y${v}`}>
              <line x1={PLOT.x} x2={PLOT.x + PLOT.w} y1={py(v)} y2={py(v)} stroke={t.border} strokeWidth="1" />
              <text x={PLOT.x - 10} y={py(v) + 4} textAnchor="end" fontSize="11" fill={t.mutedFg} style={{ fontFamily: MONO }}>
                {tick(yDef.kind, v)}
              </text>
            </g>
          ))}
          {ax.ticks.map((v) => (
            <g key={`x${v}`}>
              <line x1={px(v)} x2={px(v)} y1={PLOT.y} y2={PLOT.y + PLOT.h} stroke={t.border} strokeWidth="1" />
              <text x={px(v)} y={PLOT.y + PLOT.h + 18} textAnchor="middle" fontSize="11" fill={t.mutedFg} style={{ fontFamily: MONO }}>
                {tick(xDef.kind, v)}
              </text>
            </g>
          ))}
          <text x={PLOT.x + PLOT.w / 2} y={H - 8} textAnchor="middle" fontSize="12" fill={t.mutedFg}>
            {`${xDef.label}${xDef.kind === 'mean' ? ' (mean rating, 1–5)' : ''}`}
          </text>
          <text
            x={14}
            y={PLOT.y + PLOT.h / 2}
            textAnchor="middle"
            fontSize="12"
            fill={t.mutedFg}
            transform={`rotate(-90 14 ${PLOT.y + PLOT.h / 2})`}
          >
            {`${yDef.label}${yDef.kind === 'mean' ? ' (mean rating, 1–5)' : ''}`}
          </text>
          {points.map((p, i) => (
            <g key={p.row.key} data-testid={`scatter-point-${p.row.key}`}>
              <title>{`${p.row.name}: ${xDef.label.toLowerCase()} ${p.row.metrics[x].display}, ${yDef.label.toLowerCase()} ${p.row.metrics[y].display}`}</title>
              <circle cx={p.x} cy={p.y} r="5" fill={t.primary} stroke={t.card} strokeWidth="2" />
              <text x={labels[i].x} y={labels[i].y} fontSize="11.5" fill={t.fg}>
                {p.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}
