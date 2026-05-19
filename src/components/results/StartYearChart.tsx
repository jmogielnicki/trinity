import { useEffect, useRef, useState } from 'react';
import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  initialBalance: number;
  selectedYears?: Set<number>;
  onToggle?: (year: number, e: React.MouseEvent) => void;
  onMarquee?: (years: number[], e: { shiftKey: boolean }) => void;
};

/**
 * Combined chart: terminal balance line (top) + outcome barcode (bottom),
 * both by start year. Clicking either panel toggles highlighting that cohort.
 */
export function StartYearChart({
  result,
  initialBalance,
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

  const margin = { left: 72, right: 28, top: 14, bottom: 4 };
  const W = 800;
  const innerW = W - margin.left - margin.right;
  const lineH = 190;
  const stripH = 22;
  const axisH = 22;
  const totalH = margin.top + lineH + stripH + axisH + margin.bottom;

  const firstYear = sims[0].startYear;
  const lastYear = sims[sims.length - 1].startYear;
  const span = Math.max(1, lastYear - firstYear);
  const colW = innerW / (span + 1);

  const xOf = (year: number) => ((year - firstYear) / (span + 1)) * innerW + colW / 2;
  const pxToYear = (px: number) => Math.round((px / innerW) * (span + 1) + firstYear);

  const completedSims = sims.filter((s) => !s.inProgress);
  const maxBalance = Math.max(
    initialBalance,
    ...completedSims.map((s) => s.finalBalance ?? 0).filter(Number.isFinite),
  );
  const yOf = (balance: number) => lineH * (1 - balance / maxBalance);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  const fmtBalance = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  };

  // Marquee drag
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

  // Ticks
  const ticks: number[] = [];
  const firstTick = Math.ceil(firstYear / 10) * 10;
  for (let y = firstTick; y <= lastYear; y += 10) ticks.push(y);

  // Y grid levels
  const yGridLevels = [0, 0.25, 0.5, 0.75, 1.0].map((f) => ({
    val: f * maxBalance,
    y: yOf(f * maxBalance),
  }));

  // Polyline for completed sims
  const completedLine = completedSims
    .map((s) => {
      const balance = s.success ? (s.finalBalance ?? 0) : 0;
      return `${xOf(s.startYear).toFixed(1)},${yOf(balance).toFixed(1)}`;
    })
    .join(' ');

  // Dashed line for in-progress sims
  const inProgressSims = sims.filter((s) => s.inProgress);
  const inProgressLine = inProgressSims
    .map((s) => `${xOf(s.startYear).toFixed(1)},${yOf(s.finalBalance ?? 0).toFixed(1)}`)
    .join(' ');

  // Connect the last completed sim to the first in-progress sim for continuity
  const bridgeLine =
    completedSims.length > 0 && inProgressSims.length > 0
      ? `${xOf(completedSims[completedSims.length - 1].startYear).toFixed(1)},${yOf(
          completedSims[completedSims.length - 1].success
            ? (completedSims[completedSims.length - 1].finalBalance ?? 0)
            : 0,
        ).toFixed(1)} ${xOf(inProgressSims[0].startYear).toFixed(1)},${yOf(
          inProgressSims[0].finalBalance ?? 0,
        ).toFixed(1)}`
      : '';

  const hasSelection = !!selectedYears && selectedYears.size > 0;
  const stripY = margin.top + lineH;
  const dotR = Math.max(2, Math.min(3.5, colW * 0.45));

  return (
    <div className="start-year-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        preserveAspectRatio="xMinYMin meet"
        onMouseDown={onSvgMouseDown}
        style={drag ? { cursor: 'crosshair', userSelect: 'none' } : undefined}
      >
        {/* ── Line chart panel ─────────────────────────────────── */}
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y grid */}
          {yGridLevels.map(({ val, y }) => (
            <g key={val}>
              <line
                x1={0}
                x2={innerW}
                y1={y}
                y2={y}
                stroke={val === 0 ? '#bbb' : '#ebebeb'}
                strokeWidth={val === 0 ? 1.5 : 1}
              />
              <text x={-6} y={y} dy="0.32em" textAnchor="end" fontSize={10} fill="#666">
                {fmtBalance(val)}
              </text>
            </g>
          ))}

          {/* Starting balance reference line */}
          <line
            x1={0}
            x2={innerW}
            y1={yOf(initialBalance)}
            y2={yOf(initialBalance)}
            stroke="#4a90d9"
            strokeWidth={1}
            strokeDasharray="4,3"
            opacity={0.55}
          />
          <text
            x={innerW + 5}
            y={yOf(initialBalance)}
            dy="0.32em"
            fontSize={9}
            fill="#4a90d9"
            opacity={0.8}
          >
            start
          </text>

          {/* Completed sims line */}
          {completedLine && (
            <polyline
              points={completedLine}
              fill="none"
              stroke="#2c5282"
              strokeWidth={1.5}
              opacity={0.75}
            />
          )}

          {/* Bridge to in-progress */}
          {bridgeLine && (
            <polyline
              points={bridgeLine}
              fill="none"
              stroke="#888"
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.5}
            />
          )}

          {/* In-progress sims line (dashed) */}
          {inProgressLine && (
            <polyline
              points={inProgressLine}
              fill="none"
              stroke="#888"
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.5}
            />
          )}

          {/* Dots per sim (colored by outcome) */}
          {sims.map((s) => {
            const balance = s.inProgress
              ? (s.finalBalance ?? 0)
              : s.success
                ? (s.finalBalance ?? 0)
                : 0;
            const cx = xOf(s.startYear);
            const cy = yOf(balance);
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <circle
                key={s.startYear}
                cx={cx}
                cy={cy}
                r={isSelected ? dotR + 1.5 : dotR}
                fill={colorOf(s)}
                fillOpacity={hasSelection && !isSelected ? 0.25 : s.inProgress ? 0.5 : 0.85}
                stroke={isSelected ? '#111' : 'none'}
                strokeWidth={isSelected ? 1.5 : 0}
                pointerEvents="none"
              />
            );
          })}

          {/* Y axis label */}
          <text
            transform={`translate(-56,${lineH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
          >
            terminal balance (real $)
          </text>
        </g>

        {/* ── Outcome strip panel ───────────────────────────────── */}
        <g transform={`translate(${margin.left},${stripY})`}>
          <text x={-6} y={stripH / 2} dy="0.32em" textAnchor="end" fontSize={10} fill="#444">
            start yr
          </text>
          {sims.map((s) => {
            const x = ((s.startYear - firstYear) / (span + 1)) * innerW;
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <g key={s.startYear}>
                <rect
                  x={x}
                  y={0}
                  width={Math.max(1, colW - 0.5)}
                  height={stripH}
                  fill={colorOf(s)}
                  fillOpacity={hasSelection && !isSelected ? 0.25 : 1}
                />
                {isSelected && (
                  <rect
                    x={x - 0.5}
                    y={-1}
                    width={Math.max(2, colW + 0.5)}
                    height={stripH + 2}
                    fill="none"
                    stroke="#111"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* ── Shared x-axis ticks ───────────────────────────────── */}
        <g transform={`translate(${margin.left},${stripY + stripH})`}>
          {ticks.map((y) => (
            <g key={y} transform={`translate(${xOf(y)},0)`}>
              <line y1={0} y2={4} stroke="#888" />
              <text y={16} textAnchor="middle" fontSize={10} fill="#666">
                {y}
              </text>
            </g>
          ))}
        </g>

        {/* ── Selected-year vertical rules (both panels) ─────────── */}
        {selectedYears &&
          [...selectedYears].map((year) => {
            const sim = sims.find((s) => s.startYear === year);
            if (!sim) return null;
            const cx = margin.left + xOf(year);
            return (
              <line
                key={year}
                x1={cx}
                x2={cx}
                y1={margin.top}
                y2={stripY + stripH}
                stroke="#111"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.35}
                pointerEvents="none"
              />
            );
          })}

        {/* ── Invisible click / drag targets ────────────────────── */}
        {sims.map((s) => {
          const x = margin.left + ((s.startYear - firstYear) / (span + 1)) * innerW;
          const balance = s.inProgress
            ? (s.finalBalance ?? 0)
            : s.success
              ? (s.finalBalance ?? 0)
              : 0;
          return (
            <g key={s.startYear}>
              <rect
                x={x}
                y={margin.top}
                width={Math.max(1, colW)}
                height={lineH + stripH}
                fill="transparent"
                onClick={(e) => onToggle?.(s.startYear, e)}
                style={{ cursor: onToggle ? 'pointer' : 'default' }}
              />
              <title>
                {s.startYear} —{' '}
                {s.inProgress
                  ? `in-progress (${fmtBalance(s.finalBalance ?? 0)} so far)`
                  : s.success
                    ? `terminal balance ${fmtBalance(balance)}`
                    : `depleted at year ${s.depletedAt}`}
                {onToggle ? ' (click to highlight)' : ''}
              </title>
            </g>
          );
        })}

        {/* ── Marquee drag overlay ───────────────────────────────── */}
        {drag && (
          <rect
            x={margin.left + Math.min(drag.x0, drag.x1)}
            y={margin.top}
            width={Math.abs(drag.x1 - drag.x0)}
            height={lineH + stripH}
            fill="#357"
            fillOpacity={0.1}
            stroke="#357"
            strokeWidth={1}
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}
