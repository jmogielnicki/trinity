import { useEffect, useRef, useState } from 'react';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  initialBalance: number;
  selectedYears?: Set<number>;
  onToggle?: (year: number, e: React.MouseEvent) => void;
  onMarquee?: (years: number[], e: { shiftKey: boolean }) => void;
};

function avgSpendOf(s: SimulationResult): number {
  if (!s.trajectory || s.trajectory.length === 0) return 0;
  return s.trajectory.reduce((sum, y) => sum + y.withdrawal, 0) / s.trajectory.length;
}

/**
 * Three-panel chart sharing one x-axis (retirement start year):
 *   top    — average annual spend
 *   middle — terminal balance
 *   bottom — outcome barcode (survived / depleted / in-progress)
 *
 * Click or shift-drag either panel to toggle/marquee-select cohorts.
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

  const W = 800;
  const margin = { left: 72, right: 32, top: 14, bottom: 6 };
  const innerW = W - margin.left - margin.right;

  const spendH = 130;
  const balH = 130;
  const gap = 10;    // vertical gap between panels
  const stripH = 22;
  const axisH = 22;
  const totalH = margin.top + spendH + gap + balH + gap + stripH + axisH + margin.bottom;

  const firstYear = sims[0].startYear;
  const lastYear = sims[sims.length - 1].startYear;
  const span = Math.max(1, lastYear - firstYear);
  const colW = innerW / (span + 1);

  const xOf = (year: number) => ((year - firstYear) / (span + 1)) * innerW + colW / 2;
  const pxToYear = (px: number) => Math.round((px / innerW) * (span + 1) + firstYear);

  // Completed / in-progress split
  const completedSims = sims.filter((s) => !s.inProgress);
  const inProgressSims = sims.filter((s) => s.inProgress);

  // ── Terminal balance scale ──────────────────────────────────────────────
  const maxBalance = Math.max(
    initialBalance,
    ...completedSims.map((s) => s.finalBalance ?? 0).filter(Number.isFinite),
  );
  const balYOf = (v: number) => balH * (1 - v / maxBalance);

  // ── Avg annual spend scale ─────────────────────────────────────────────
  const spendVals = sims.map(avgSpendOf).filter((v) => v > 0);
  const maxSpend = spendVals.length ? Math.max(...spendVals) : 1;
  const spendYOf = (v: number) => spendH * (1 - v / maxSpend);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  const fmtMoney = (v: number) => {
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

  const hasSelection = !!selectedYears && selectedYears.size > 0;
  const dotR = Math.max(2, Math.min(3.5, colW * 0.45));

  // Panel y-offsets from top of inner area
  const spendY0 = margin.top;
  const balY0 = spendY0 + spendH + gap;
  const stripY0 = balY0 + balH + gap;

  // Helper: build a polyline points string for a list of sims
  const linePoints = (simList: typeof sims, yFn: (s: typeof sims[number]) => number) =>
    simList.map((s) => `${xOf(s.startYear).toFixed(1)},${yFn(s).toFixed(1)}`).join(' ');

  // Grid levels for each panel
  const balGridLevels = [0, 0.5, 1.0].map((f) => ({ val: f * maxBalance, y: balYOf(f * maxBalance) }));
  const spendGridLevels = [0, 0.5, 1.0].map((f) => ({ val: f * maxSpend, y: spendYOf(f * maxSpend) }));

  // Panel connector: last completed → first in-progress
  const lastCompleted = completedSims[completedSims.length - 1];
  const firstInProgress = inProgressSims[0];

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

        {/* ══ Panel 1: Avg annual spend ═══════════════════════════════════ */}
        <g transform={`translate(${margin.left},${spendY0})`}>
          {spendGridLevels.map(({ val, y }) => (
            <g key={val}>
              <line x1={0} x2={innerW} y1={y} y2={y}
                stroke={val === 0 ? '#bbb' : '#ebebeb'} strokeWidth={val === 0 ? 1.5 : 1} />
              <text x={-6} y={y} dy="0.32em" textAnchor="end" fontSize={10} fill="#666">
                {fmtMoney(val)}
              </text>
            </g>
          ))}

          {/* Completed sims line */}
          {completedSims.length > 1 && (
            <polyline
              points={linePoints(completedSims, (s) => spendYOf(avgSpendOf(s)))}
              fill="none" stroke="#2c5282" strokeWidth={1.5} opacity={0.75}
            />
          )}
          {/* Bridge to in-progress */}
          {lastCompleted && firstInProgress && (
            <polyline
              points={`${xOf(lastCompleted.startYear).toFixed(1)},${spendYOf(avgSpendOf(lastCompleted)).toFixed(1)} ${xOf(firstInProgress.startYear).toFixed(1)},${spendYOf(avgSpendOf(firstInProgress)).toFixed(1)}`}
              fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}
            />
          )}
          {/* In-progress sims line */}
          {inProgressSims.length > 1 && (
            <polyline
              points={linePoints(inProgressSims, (s) => spendYOf(avgSpendOf(s)))}
              fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}
            />
          )}

          {/* Dots */}
          {sims.map((s) => {
            const cx = xOf(s.startYear);
            const cy = spendYOf(avgSpendOf(s));
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <circle key={s.startYear} cx={cx} cy={cy}
                r={isSelected ? dotR + 1.5 : dotR}
                fill={colorOf(s)}
                fillOpacity={hasSelection && !isSelected ? 0.25 : s.inProgress ? 0.5 : 0.85}
                stroke={isSelected ? '#111' : 'none'} strokeWidth={isSelected ? 1.5 : 0}
                pointerEvents="none"
              />
            );
          })}

          {/* Y-axis label */}
          <text transform={`translate(-56,${spendH / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={10} fill="#555">
            avg annual spend (real $)
          </text>
        </g>

        {/* ══ Panel 2: Terminal balance ════════════════════════════════════ */}
        <g transform={`translate(${margin.left},${balY0})`}>
          {balGridLevels.map(({ val, y }) => (
            <g key={val}>
              <line x1={0} x2={innerW} y1={y} y2={y}
                stroke={val === 0 ? '#bbb' : '#ebebeb'} strokeWidth={val === 0 ? 1.5 : 1} />
              <text x={-6} y={y} dy="0.32em" textAnchor="end" fontSize={10} fill="#666">
                {fmtMoney(val)}
              </text>
            </g>
          ))}

          {/* Starting balance reference */}
          <line x1={0} x2={innerW}
            y1={balYOf(initialBalance)} y2={balYOf(initialBalance)}
            stroke="#4a90d9" strokeWidth={1} strokeDasharray="4,3" opacity={0.55}
          />
          <text x={innerW + 5} y={balYOf(initialBalance)} dy="0.32em"
            fontSize={9} fill="#4a90d9" opacity={0.8}>
            start
          </text>

          {/* Completed sims line */}
          {completedSims.length > 1 && (
            <polyline
              points={linePoints(completedSims, (s) => balYOf(s.success ? (s.finalBalance ?? 0) : 0))}
              fill="none" stroke="#2c5282" strokeWidth={1.5} opacity={0.75}
            />
          )}
          {/* Bridge to in-progress */}
          {lastCompleted && firstInProgress && (
            <polyline
              points={`${xOf(lastCompleted.startYear).toFixed(1)},${balYOf(lastCompleted.success ? (lastCompleted.finalBalance ?? 0) : 0).toFixed(1)} ${xOf(firstInProgress.startYear).toFixed(1)},${balYOf(firstInProgress.finalBalance ?? 0).toFixed(1)}`}
              fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}
            />
          )}
          {/* In-progress sims line */}
          {inProgressSims.length > 1 && (
            <polyline
              points={linePoints(inProgressSims, (s) => balYOf(s.finalBalance ?? 0))}
              fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}
            />
          )}

          {/* Dots */}
          {sims.map((s) => {
            const balance = s.inProgress ? (s.finalBalance ?? 0) : s.success ? (s.finalBalance ?? 0) : 0;
            const cx = xOf(s.startYear);
            const cy = balYOf(balance);
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <circle key={s.startYear} cx={cx} cy={cy}
                r={isSelected ? dotR + 1.5 : dotR}
                fill={colorOf(s)}
                fillOpacity={hasSelection && !isSelected ? 0.25 : s.inProgress ? 0.5 : 0.85}
                stroke={isSelected ? '#111' : 'none'} strokeWidth={isSelected ? 1.5 : 0}
                pointerEvents="none"
              />
            );
          })}

          {/* Y-axis label */}
          <text transform={`translate(-56,${balH / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={10} fill="#555">
            terminal balance (real $)
          </text>
        </g>

        {/* ══ Panel 3: Outcome barcode ═════════════════════════════════════ */}
        <g transform={`translate(${margin.left},${stripY0})`}>
          <text x={-6} y={stripH / 2} dy="0.32em" textAnchor="end" fontSize={10} fill="#444">
            start yr
          </text>
          {sims.map((s) => {
            const x = ((s.startYear - firstYear) / (span + 1)) * innerW;
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <g key={s.startYear}>
                <rect x={x} y={0}
                  width={Math.max(1, colW - 0.5)} height={stripH}
                  fill={colorOf(s)}
                  fillOpacity={hasSelection && !isSelected ? 0.25 : 1}
                />
                {isSelected && (
                  <rect x={x - 0.5} y={-1}
                    width={Math.max(2, colW + 0.5)} height={stripH + 2}
                    fill="none" stroke="#111" strokeWidth={1.5} pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* ══ Shared x-axis ticks ══════════════════════════════════════════ */}
        <g transform={`translate(${margin.left},${stripY0 + stripH})`}>
          {ticks.map((y) => (
            <g key={y} transform={`translate(${xOf(y)},0)`}>
              <line y1={0} y2={4} stroke="#888" />
              <text y={16} textAnchor="middle" fontSize={10} fill="#666">{y}</text>
            </g>
          ))}
        </g>

        {/* ══ Panel divider lines ═══════════════════════════════════════════ */}
        <line
          x1={margin.left} x2={W - margin.right}
          y1={balY0 - gap / 2} y2={balY0 - gap / 2}
          stroke="#ddd" strokeWidth={1}
        />
        <line
          x1={margin.left} x2={W - margin.right}
          y1={stripY0 - gap / 2} y2={stripY0 - gap / 2}
          stroke="#ddd" strokeWidth={1}
        />

        {/* ══ Selected-year vertical rules (all panels) ════════════════════ */}
        {selectedYears && [...selectedYears].map((year) => {
          const sim = sims.find((s) => s.startYear === year);
          if (!sim) return null;
          const cx = margin.left + xOf(year);
          return (
            <line key={year}
              x1={cx} x2={cx}
              y1={spendY0} y2={stripY0 + stripH}
              stroke="#111" strokeWidth={1} strokeDasharray="2,2" opacity={0.3}
              pointerEvents="none"
            />
          );
        })}

        {/* ══ Invisible click / drag targets (full height) ═════════════════ */}
        {sims.map((s) => {
          const x = margin.left + ((s.startYear - firstYear) / (span + 1)) * innerW;
          const balance = s.inProgress ? (s.finalBalance ?? 0) : s.success ? (s.finalBalance ?? 0) : 0;
          return (
            <g key={s.startYear}>
              <rect
                x={x} y={spendY0}
                width={Math.max(1, colW)} height={stripY0 + stripH - spendY0}
                fill="transparent"
                onClick={(e) => onToggle?.(s.startYear, e)}
                style={{ cursor: onToggle ? 'pointer' : 'default' }}
              />
              <title>
                {s.startYear} —{' '}
                {s.inProgress
                  ? `in-progress (${fmtMoney(balance)} so far, avg spend ${fmtMoney(avgSpendOf(s))}/yr)`
                  : s.success
                    ? `terminal balance ${fmtMoney(balance)}, avg spend ${fmtMoney(avgSpendOf(s))}/yr`
                    : `depleted at year ${s.depletedAt}, avg spend ${fmtMoney(avgSpendOf(s))}/yr`}
                {onToggle ? ' (click to highlight)' : ''}
              </title>
            </g>
          );
        })}

        {/* ══ Marquee drag overlay ══════════════════════════════════════════ */}
        {drag && (
          <rect
            x={margin.left + Math.min(drag.x0, drag.x1)}
            y={spendY0}
            width={Math.abs(drag.x1 - drag.x0)}
            height={stripY0 + stripH - spendY0}
            fill="#357" fillOpacity={0.1}
            stroke="#357" strokeWidth={1} strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}
