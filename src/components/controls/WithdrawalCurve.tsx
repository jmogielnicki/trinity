import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import type { WithdrawalStrategy } from '../../engine/strategies';
import { CHART } from '../colors';
import { useElementWidth } from './useElementWidth';

type Props = {
  horizonYears: number;
  /** Current strategy. We render its piecewise control points if piecewise,
   * otherwise a flat polyline at the implied constant rate. */
  withdrawal: WithdrawalStrategy;
  onChange: (w: WithdrawalStrategy) => void;
  /** Optional fixed width; omit to fill (and track) the container. */
  width?: number;
  height?: number;
};

/** Number of control handles. Evenly spaced across the horizon. */
const N_HANDLES = 5;
const MIN_RATE = 0.01;
const MAX_RATE = 0.1;
const SNAP_STEP = 0.0025;

type Handle = { tFrac: number; rate: number };

function interpolatePiecewiseLinear(
  points: { t: number; rate: number }[],
  horizonYears: number,
): Handle[] {
  const lastT = Math.max(1, horizonYears - 1);
  // Sort by t ascending
  const sorted = [...points].sort((a, b) => a.t - b.t);
  return Array.from({ length: N_HANDLES }, (_, i) => {
    const tFrac = i / (N_HANDLES - 1);
    const t = tFrac * lastT;
    // Find surrounding segment and linearly interpolate rate
    if (t <= sorted[0].t) return { tFrac, rate: sorted[0].rate };
    if (t >= sorted[sorted.length - 1].t) return { tFrac, rate: sorted[sorted.length - 1].rate };
    for (let j = 0; j < sorted.length - 1; j++) {
      if (t >= sorted[j].t && t <= sorted[j + 1].t) {
        const span = sorted[j + 1].t - sorted[j].t;
        const alpha = span === 0 ? 0 : (t - sorted[j].t) / span;
        return { tFrac, rate: sorted[j].rate + alpha * (sorted[j + 1].rate - sorted[j].rate) };
      }
    }
    return { tFrac, rate: sorted[sorted.length - 1].rate };
  });
}

function strategyToHandles(
  w: WithdrawalStrategy,
  horizonYears: number,
): Handle[] {
  const baseRate =
    w.type === 'fixedPercent'
      ? w.rate
      : w.type === 'piecewiseLinear'
        ? (w.points[0]?.rate ?? 0.04)
        : w.type === 'piecewise'
          ? (w.pieces[0]?.rate ?? 0.04)
          : 0.04;
  if (w.type === 'piecewiseLinear' && w.points.length > 0 && horizonYears > 0) {
    if (w.points.length === N_HANDLES) {
      return w.points.map((p, i) => ({
        tFrac: horizonYears <= 1 ? i / (N_HANDLES - 1) : p.t / (horizonYears - 1),
        rate: p.rate,
      }));
    }
    return interpolatePiecewiseLinear(w.points, horizonYears);
  }
  return Array.from({ length: N_HANDLES }, (_, i) => ({
    tFrac: i / (N_HANDLES - 1),
    rate: baseRate,
  }));
}

function handlesToStrategy(
  handles: Handle[],
  horizonYears: number,
): WithdrawalStrategy {
  // Always emit piecewiseLinear so modeOf can distinguish the curve editor
  // from the fixed-rate slider (which emits fixedPercent directly).
  const lastT = Math.max(0, horizonYears - 1);
  const points = handles.map((h) => ({ t: h.tFrac * lastT, rate: h.rate }));
  return { type: 'piecewiseLinear', points };
}

function snap(rate: number): number {
  return Math.round(rate / SNAP_STEP) * SNAP_STEP;
}

export function WithdrawalCurve({
  horizonYears,
  withdrawal,
  onChange,
  width: widthProp,
  height = 160,
}: Props) {
  const [handles, setHandles] = useState<Handle[]>(() =>
    strategyToHandles(withdrawal, horizonYears),
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [wrapRef, measuredW] = useElementWidth(280);
  const width = widthProp ?? measuredW;

  // Re-sync if external changes arrive (e.g. horizon change or external strategy load).
  // Include a stable serialization of piecewiseLinear points so preset switches with
  // the same withdrawal type (but different point values) also trigger a re-sync.
  const pointsKey =
    withdrawal.type === 'piecewiseLinear'
      ? withdrawal.points.map((p) => `${p.t}:${p.rate}`).join(',')
      : '';
  useEffect(() => {
    setHandles(strategyToHandles(withdrawal, horizonYears));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawal.type, pointsKey, horizonYears]);

  // right margin clears the rightmost handle's centered "%" label
  const margin = { top: 12, right: 20, bottom: 24, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const x = scaleLinear().domain([0, 1]).range([0, innerW]);
  const y = scaleLinear().domain([MIN_RATE, MAX_RATE]).range([innerH, 0]);

  useEffect(() => {
    const svg = select(svgRef.current);
    svg.selectAll<SVGCircleElement, Handle>('.handle').call(
      drag<SVGCircleElement, Handle>()
        .on('drag', function (event, d) {
          const idx = handles.indexOf(d);
          if (idx < 0) return;
          const yPx = Math.max(0, Math.min(innerH, event.y - margin.top));
          const rate = snap(
            Math.max(MIN_RATE, Math.min(MAX_RATE, y.invert(yPx))),
          );
          const next = handles.map((h, i) => (i === idx ? { ...h, rate } : h));
          setHandles(next);
          onChange(handlesToStrategy(next, horizonYears));
        }),
    );
  }, [handles, horizonYears, onChange, innerH, margin.top, y]);

  const polyPoints = handles
    .map((h) => `${x(h.tFrac) + margin.left},${y(h.rate) + margin.top}`)
    .join(' ');

  // Filled area under the curve (down to the baseline) — light brand wash.
  const baselineY = margin.top + innerH;
  const firstX = x(handles[0].tFrac) + margin.left;
  const lastX = x(handles[handles.length - 1].tFrac) + margin.left;
  const areaPoints = `${firstX},${baselineY} ${polyPoints} ${lastX},${baselineY}`;

  const yTicks = [0.02, 0.04, 0.06, 0.08, 0.1];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">
        Withdrawal curve — drag handles. Snaps at 3, 3.5, 4, 4.5, 5%.
      </div>
      <div ref={wrapRef} className="w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block touch-none select-none"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(t) + margin.top}
              y2={y(t) + margin.top}
              stroke={CHART.hairline}
            />
            <text
              x={margin.left - 6}
              y={y(t) + margin.top}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill={CHART.faint}
            >
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <polygon points={areaPoints} fill="var(--color-brand-soft)" opacity={0.7} stroke="none" />
        <polyline
          points={polyPoints}
          fill="none"
          stroke={CHART.accent}
          strokeWidth={2.5}
        />
        {handles.map((h, i) => (
          <g key={`label-${i}`} pointerEvents="none">
            <text
              x={x(h.tFrac) + margin.left}
              y={y(h.rate) + margin.top - 10}
              textAnchor="middle"
              fontSize={10}
              fontWeight={500}
              fill={CHART.accent}
              style={{
                paintOrder: 'stroke',
                stroke: CHART.surface,
                strokeWidth: 3,
              }}
            >
              {(h.rate * 100).toFixed(2)}%
            </text>
          </g>
        ))}
        {handles.map((h, i) => (
          <circle
            key={i}
            className="handle"
            cx={x(h.tFrac) + margin.left}
            cy={y(h.rate) + margin.top}
            r={6}
            fill={CHART.surface}
            stroke={CHART.accent}
            strokeWidth={2}
            cursor="ns-resize"
            // d3-drag attaches its own handlers; React doesn't need any.
            data-rate={h.rate}
            data-tfrac={h.tFrac}
            // Bind data so d3.select can read __data__
            ref={(el) => {
              if (el) (el as unknown as { __data__: Handle }).__data__ = h;
            }}
          />
        ))}
        <text
          x={width - margin.right}
          y={height - 6}
          textAnchor="end"
          fontSize={10}
          fill={CHART.faint}
        >
          year {horizonYears}
        </text>
        <text x={margin.left} y={height - 6} fontSize={10} fill={CHART.faint}>
          year 0
        </text>
      </svg>
      </div>
    </div>
  );
}
