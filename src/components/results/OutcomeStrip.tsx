import { useEffect, useRef, useState } from 'react';
import type { ScenarioResult } from '../../engine/types';
import { CHART, OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  width?: number;
  selectedYears?: Set<number>;
  onToggle?: (year: number, e: React.MouseEvent) => void;
  onMarquee?: (years: number[], e: { shiftKey: boolean }) => void;
};

/**
 * Barcode of outcomes by start year. One vertical mark per start year,
 * colored by outcome. Click a mark to toggle highlighting that start year
 * in the spaghetti chart above. Shift-click extends the selection to a
 * contiguous range.
 */
export function OutcomeStrip({
  result,
  width = 800,
  selectedYears,
  onToggle,
  onMarquee,
}: Props) {
  const sims = [...result.sims].sort((a, b) => a.startYear - b.startYear);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<null | { x0: number; x1: number }>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;
  if (sims.length === 0) return null;

  const margin = { left: 64, right: 16, top: 6, bottom: 22 };
  const innerW = width - margin.left - margin.right;
  const stripH = 24;
  const height = stripH + margin.top + margin.bottom;

  const firstYear = sims[0].startYear;
  const lastYear = sims[sims.length - 1].startYear;
  const span = Math.max(1, lastYear - firstYear);
  const colW = innerW / (span + 1);

  // Pixel x → start year (rounded).
  const pxToYear = (px: number) =>
    Math.round((px / innerW) * (span + 1) + firstYear);

  // Marquee: shift+mousedown starts horizontal drag; release commits the
  // years whose start-year column intersects the x range.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left - margin.left;
      setDrag((d) => (d ? { ...d, x1: px } : d));
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !onMarquee) return;
      const lo = Math.min(d.x0, d.x1);
      const hi = Math.max(d.x0, d.x1);
      if (hi - lo < 3) return;
      const yLo = pxToYear(lo);
      const yHi = pxToYear(hi);
      const out: number[] = [];
      for (const s of sims) {
        if (s.startYear >= yLo && s.startYear <= yHi) out.push(s.startYear);
      }
      onMarquee(out, { shiftKey: e.shiftKey });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, onMarquee, sims]);

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onMarquee || !e.shiftKey) return;
    const r = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left - margin.left;
    setDrag({ x0: px, x1: px });
    e.preventDefault();
  };

  const ticks: number[] = [];
  const firstTick = Math.ceil(firstYear / 10) * 10;
  for (let y = firstTick; y <= lastYear; y += 10) ticks.push(y);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  const hasSelection = !!selectedYears && selectedYears.size > 0;

  return (
    <div className="block">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMinYMin meet"
        className="block"
        onMouseDown={onSvgMouseDown}
        style={drag ? { cursor: 'crosshair', userSelect: 'none' } : undefined}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          <text x={-8} y={stripH / 2} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.label}>
            start year
          </text>
          {sims.map((s) => {
            const x = ((s.startYear - firstYear) / (span + 1)) * innerW;
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <g
                key={s.startYear}
                onClick={(e) => onToggle?.(s.startYear, e)}
                style={{ cursor: onToggle ? 'pointer' : 'default' }}
              >
                <rect
                  x={x}
                  y={0}
                  width={Math.max(1, colW - 0.5)}
                  height={stripH}
                  fill={colorOf(s)}
                  fillOpacity={hasSelection && !isSelected ? 0.3 : 1}
                />
                {isSelected && (
                  <rect
                    x={x - 0.5}
                    y={-1}
                    width={Math.max(2, colW + 0.5)}
                    height={stripH + 2}
                    fill="none"
                    stroke={CHART.ink}
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                )}
                <title>
                  {s.startYear} — {!s.success && !s.inProgress
                    ? `depleted at year ${s.depletedAt}`
                    : s.inProgress
                      ? 'in-progress'
                      : 'survived'}
                  {onToggle ? ' (click to highlight)' : ''}
                </title>
              </g>
            );
          })}
          {ticks.map((y) => (
            <g key={y} transform={`translate(${((y - firstYear) / (span + 1)) * innerW},${stripH})`}>
              <line y1={0} y2={4} stroke={CHART.faint} />
              <text y={16} textAnchor="middle" fontSize={10} fill={CHART.muted}>
                {y}
              </text>
            </g>
          ))}
          {drag && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={-1}
              width={Math.abs(drag.x1 - drag.x0)}
              height={stripH + 2}
              fill={CHART.accent}
              fillOpacity={0.12}
              stroke={CHART.accent}
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  );
}

