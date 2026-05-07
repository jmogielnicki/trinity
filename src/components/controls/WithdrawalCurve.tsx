import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import type { WithdrawalStrategy } from '../../engine/strategies';

type Props = {
  horizonYears: number;
  /** Current strategy. We render its piecewise control points if piecewise,
   * otherwise a flat polyline at the implied constant rate. */
  withdrawal: WithdrawalStrategy;
  onChange: (w: WithdrawalStrategy) => void;
  width?: number;
  height?: number;
};

/** Number of control handles. Evenly spaced across the horizon. */
const N_HANDLES = 5;
const MIN_RATE = 0.01;
const MAX_RATE = 0.1;
const SNAP_RATES = [0.03, 0.035, 0.04, 0.045, 0.05];
const SNAP_TOL = 0.0025;

type Handle = { tFrac: number; rate: number };

function strategyToHandles(w: WithdrawalStrategy): Handle[] {
  const baseRate =
    w.type === 'fixedPercent'
      ? w.rate
      : w.type === 'piecewise'
        ? w.pieces[0]?.rate ?? 0.04
        : 0.04;
  if (w.type === 'piecewise' && w.pieces.length === N_HANDLES) {
    return w.pieces.map((p, i) => ({
      tFrac: i / (N_HANDLES - 1),
      rate: p.rate,
    }));
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
  const allEqual = handles.every((h) => h.rate === handles[0].rate);
  if (allEqual) return { type: 'fixedPercent', rate: handles[0].rate };
  // Piecewise: each handle controls the rate from its tFrac up to the next.
  const pieces = handles.map((h, i) => {
    const nextFrac = i + 1 < handles.length ? handles[i + 1].tFrac : 1.0001;
    return { until: Math.ceil(nextFrac * horizonYears), rate: h.rate };
  });
  return { type: 'piecewise', pieces };
}

function snap(rate: number): number {
  for (const s of SNAP_RATES) {
    if (Math.abs(rate - s) < SNAP_TOL) return s;
  }
  return rate;
}

export function WithdrawalCurve({
  horizonYears,
  withdrawal,
  onChange,
  width = 280,
  height = 160,
}: Props) {
  const [handles, setHandles] = useState<Handle[]>(() =>
    strategyToHandles(withdrawal),
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Re-sync if external changes arrive (e.g. horizon change).
  useEffect(() => {
    setHandles(strategyToHandles(withdrawal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawal.type]);

  const margin = { top: 12, right: 12, bottom: 24, left: 36 };
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

  const yTicks = [0.02, 0.04, 0.06, 0.08, 0.1];

  return (
    <div className="control-group">
      <div className="control-label">
        Withdrawal curve — drag handles. Snaps at 3, 3.5, 4, 4.5, 5%.
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="curve-editor"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(t) + margin.top}
              y2={y(t) + margin.top}
              stroke="#eee"
            />
            <text
              x={margin.left - 6}
              y={y(t) + margin.top}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill="#888"
            >
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <polyline
          points={polyPoints}
          fill="none"
          stroke="#357"
          strokeWidth={2}
        />
        {handles.map((h, i) => (
          <g key={`label-${i}`} pointerEvents="none">
            <text
              x={x(h.tFrac) + margin.left}
              y={y(h.rate) + margin.top - 10}
              textAnchor="middle"
              fontSize={10}
              fontWeight={500}
              fill="#357"
              style={{
                paintOrder: 'stroke',
                stroke: '#fff',
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
            fill="#fff"
            stroke="#357"
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
          fill="#888"
        >
          year {horizonYears}
        </text>
        <text x={margin.left} y={height - 6} fontSize={10} fill="#888">
          year 0
        </text>
      </svg>
    </div>
  );
}
