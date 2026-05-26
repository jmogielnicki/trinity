import { useLayoutEffect, useEffect, useRef, useState, useCallback } from 'react';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  initialBalance: number;
  height?: number;
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
 * Uses a ResizeObserver so it renders at exact pixel dimensions and fills
 * whatever height the parent specifies — no viewBox aspect-ratio scaling.
 */
export function StartYearChart({
  result,
  initialBalance,
  height: propHeight = 368,
  selectedYears,
  onToggle,
  onMarquee,
}: Props) {
  const sims = [...result.sims].sort((a, b) => a.startYear - b.startYear);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [drag, setDrag] = useState<null | { x0: number; x1: number }>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;
  const [hovered, setHovered] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Measure container width synchronously then track changes.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setContainerW(el.clientWidth || 800);
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (sims.length === 0) return <div ref={wrapRef} />;

  // ── Layout constants (in pixels) ────────────────────────────────────────
  const W = containerW;
  const ml = 72, mr = 32, mt = 14, mb = 6;
  const innerW = W - ml - mr;
  const stripH = 22;
  const axisH = 22;
  const gap = 10;
  const fixedH = mt + mb + stripH + axisH + gap * 2;
  const pairH = Math.max(60, propHeight - fixedH);
  const spendH = Math.floor(pairH / 2);
  const balH = pairH - spendH;
  const totalH = propHeight;

  const spendY0 = mt;
  const balY0 = spendY0 + spendH + gap;
  const stripY0 = balY0 + balH + gap;

  // ── X helpers ────────────────────────────────────────────────────────────
  const firstYear = sims[0].startYear;
  const lastYear = sims[sims.length - 1].startYear;
  const span = Math.max(1, lastYear - firstYear);
  const colW = innerW / (span + 1);
  const xOf = (year: number) => ml + ((year - firstYear) / (span + 1)) * innerW + colW / 2;
  // ── Completed / in-progress ───────────────────────────────────────────────
  const completedSims = sims.filter((s) => !s.inProgress);
  const inProgressSims = sims.filter((s) => s.inProgress);
  const lastCompleted = completedSims[completedSims.length - 1];
  const firstInProgress = inProgressSims[0];

  // ── Terminal balance scale ────────────────────────────────────────────────
  const maxBalance = Math.max(
    initialBalance,
    ...completedSims.map((s) => s.finalBalance ?? 0).filter(Number.isFinite),
  );
  const balYOf = (v: number) => balY0 + balH * (1 - v / maxBalance);

  // ── Avg annual spend scale ────────────────────────────────────────────────
  const spendVals = sims.map(avgSpendOf).filter((v) => v > 0);
  const maxSpend = spendVals.length ? Math.max(...spendVals) : 1;
  const spendYOf = (v: number) => spendY0 + spendH * (1 - v / maxSpend);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  const fmt = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  };

  // ── Marquee drag ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, x1: e.clientX - r.left } : d));
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !onMarquee) return;
      const lo = Math.min(d.x0, d.x1);
      const hi = Math.max(d.x0, d.x1);
      if (hi - lo < 3) return;
      const out: number[] = [];
      for (const s of sims) {
        const x = xOf(s.startYear);
        if (x >= lo && x <= hi) out.push(s.startYear);
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
    setDrag({ x0: e.clientX - r.left, x1: e.clientX - r.left });
    e.preventDefault();
  };

  const onSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);

  const onSvgMouseLeave = useCallback(() => {
    setHovered(null);
    setMousePos(null);
  }, []);

  // ── Ticks (dynamic density based on available pixels) ────────────────────
  const labelPx = 36; // ~4 chars × ~6px + padding
  const maxLabels = Math.max(2, Math.floor(innerW / labelPx));
  const rawStep = span / maxLabels;
  const tickStep = [5, 10, 20, 25, 50].find((s) => s >= rawStep) ?? 50;
  const ticks: number[] = [];
  const firstTick = Math.ceil(firstYear / tickStep) * tickStep;
  for (let y = firstTick; y <= lastYear; y += tickStep) ticks.push(y);

  // ── Y grid levels ─────────────────────────────────────────────────────────
  const balGrid = [0, 0.5, 1.0].map((f) => ({ val: f * maxBalance, y: balYOf(f * maxBalance) }));
  const spendGrid = [0, 0.5, 1.0].map((f) => ({ val: f * maxSpend, y: spendYOf(f * maxSpend) }));

  // ── Polyline helpers ─────────────────────────────────────────────────────
  const pts = (simList: typeof sims, yFn: (s: typeof sims[number]) => number) =>
    simList.map((s) => `${xOf(s.startYear).toFixed(1)},${yFn(s).toFixed(1)}`).join(' ');

  const hasSelection = !!selectedYears && selectedYears.size > 0;
  const dotR = Math.max(2, Math.min(3.5, colW * 0.45));

  return (
    <div ref={wrapRef} className="block">
      <svg
        ref={svgRef}
        width={W}
        height={totalH}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseLeave={onSvgMouseLeave}
        style={{ display: 'block', width: '100%', maxWidth: W, ...(drag ? { cursor: 'crosshair', userSelect: 'none' } : {}) }}
      >
        {/* ══ Avg annual spend ══════════════════════════════════════════════ */}
        {spendGrid.map(({ val, y }) => (
          <g key={`sg-${val}`}>
            <line x1={ml} x2={W - mr} y1={y} y2={y}
              stroke={val === 0 ? '#bbb' : '#ebebeb'} strokeWidth={val === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="#666">
              {fmt(val)}
            </text>
          </g>
        ))}
        {/* Y-axis label */}
        <text
          transform={`translate(${ml - 60},${spendY0 + spendH / 2}) rotate(-90)`}
          textAnchor="middle" fontSize={11} fill="#555"
        >
          avg annual spend (real $)
        </text>
        {/* Lines */}
        {completedSims.length > 1 && (
          <polyline points={pts(completedSims, (s) => spendYOf(avgSpendOf(s)))}
            fill="none" stroke="#2c5282" strokeWidth={1.5} opacity={0.75} />
        )}
        {lastCompleted && firstInProgress && (
          <polyline
            points={`${xOf(lastCompleted.startYear).toFixed(1)},${spendYOf(avgSpendOf(lastCompleted)).toFixed(1)} ${xOf(firstInProgress.startYear).toFixed(1)},${spendYOf(avgSpendOf(firstInProgress)).toFixed(1)}`}
            fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        )}
        {inProgressSims.length > 1 && (
          <polyline points={pts(inProgressSims, (s) => spendYOf(avgSpendOf(s)))}
            fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        )}
        {/* Dots */}
        {sims.map((s) => {
          const isSelected = selectedYears?.has(s.startYear) ?? false;
          return (
            <circle key={`sd-${s.startYear}`} cx={xOf(s.startYear)} cy={spendYOf(avgSpendOf(s))}
              r={isSelected ? dotR + 1.5 : dotR}
              fill={colorOf(s)}
              fillOpacity={hasSelection && !isSelected ? 0.25 : s.inProgress ? 0.5 : 0.85}
              stroke={isSelected ? '#111' : 'none'} strokeWidth={isSelected ? 1.5 : 0}
              pointerEvents="none" />
          );
        })}

        {/* ══ Panel divider ═════════════════════════════════════════════════ */}
        <line x1={ml} x2={W - mr} y1={balY0 - gap / 2} y2={balY0 - gap / 2}
          stroke="#ddd" strokeWidth={1} />

        {/* ══ Terminal balance ══════════════════════════════════════════════ */}
        {balGrid.map(({ val, y }) => (
          <g key={`bg-${val}`}>
            <line x1={ml} x2={W - mr} y1={y} y2={y}
              stroke={val === 0 ? '#bbb' : '#ebebeb'} strokeWidth={val === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="#666">
              {fmt(val)}
            </text>
          </g>
        ))}
        {/* Starting balance reference */}
        <line x1={ml} x2={W - mr}
          y1={balYOf(initialBalance)} y2={balYOf(initialBalance)}
          stroke="#4a90d9" strokeWidth={1} strokeDasharray="4,3" opacity={0.55} />
        <text x={W - mr + 5} y={balYOf(initialBalance)} dy="0.32em"
          fontSize={10} fill="#4a90d9" opacity={0.8}>start</text>
        {/* Y-axis label */}
        <text
          transform={`translate(${ml - 60},${balY0 + balH / 2}) rotate(-90)`}
          textAnchor="middle" fontSize={11} fill="#555"
        >
          terminal balance (real $)
        </text>
        {/* Lines */}
        {completedSims.length > 1 && (
          <polyline
            points={pts(completedSims, (s) => balYOf(s.success ? (s.finalBalance ?? 0) : 0))}
            fill="none" stroke="#2c5282" strokeWidth={1.5} opacity={0.75} />
        )}
        {lastCompleted && firstInProgress && (
          <polyline
            points={`${xOf(lastCompleted.startYear).toFixed(1)},${balYOf(lastCompleted.success ? (lastCompleted.finalBalance ?? 0) : 0).toFixed(1)} ${xOf(firstInProgress.startYear).toFixed(1)},${balYOf(firstInProgress.finalBalance ?? 0).toFixed(1)}`}
            fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        )}
        {inProgressSims.length > 1 && (
          <polyline points={pts(inProgressSims, (s) => balYOf(s.finalBalance ?? 0))}
            fill="none" stroke="#888" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        )}
        {/* Dots */}
        {sims.map((s) => {
          const balance = s.inProgress ? (s.finalBalance ?? 0) : s.success ? (s.finalBalance ?? 0) : 0;
          const isSelected = selectedYears?.has(s.startYear) ?? false;
          return (
            <circle key={`bd-${s.startYear}`} cx={xOf(s.startYear)} cy={balYOf(balance)}
              r={isSelected ? dotR + 1.5 : dotR}
              fill={colorOf(s)}
              fillOpacity={hasSelection && !isSelected ? 0.25 : s.inProgress ? 0.5 : 0.85}
              stroke={isSelected ? '#111' : 'none'} strokeWidth={isSelected ? 1.5 : 0}
              pointerEvents="none" />
          );
        })}

        {/* ══ Panel divider ═════════════════════════════════════════════════ */}
        <line x1={ml} x2={W - mr} y1={stripY0 - gap / 2} y2={stripY0 - gap / 2}
          stroke="#ddd" strokeWidth={1} />

        {/* ══ Outcome barcode ═══════════════════════════════════════════════ */}
        <text x={ml - 6} y={stripY0 + stripH / 2} dy="0.32em"
          textAnchor="end" fontSize={11} fill="#444">start yr</text>
        {sims.map((s) => {
          const x = ml + ((s.startYear - firstYear) / (span + 1)) * innerW;
          const isSelected = selectedYears?.has(s.startYear) ?? false;
          return (
            <g key={`strip-${s.startYear}`}>
              <rect x={x} y={stripY0} width={Math.max(1, colW - 0.5)} height={stripH}
                fill={colorOf(s)} fillOpacity={hasSelection && !isSelected ? 0.25 : 1} />
              {isSelected && (
                <rect x={x - 0.5} y={stripY0 - 1}
                  width={Math.max(2, colW + 0.5)} height={stripH + 2}
                  fill="none" stroke="#111" strokeWidth={1.5} pointerEvents="none" />
              )}
            </g>
          );
        })}

        {/* ══ X-axis ticks ══════════════════════════════════════════════════ */}
        {ticks.map((y) => (
          <g key={`tick-${y}`} transform={`translate(${xOf(y)},${stripY0 + stripH})`}>
            <line y1={0} y2={4} stroke="#888" />
            <text y={16} textAnchor="middle" fontSize={11} fill="#666">{y}</text>
          </g>
        ))}

        {/* ══ Selected-year vertical rules ══════════════════════════════════ */}
        {selectedYears && [...selectedYears].map((year) => {
          if (!sims.find((s) => s.startYear === year)) return null;
          const cx = xOf(year);
          return (
            <line key={`rule-${year}`}
              x1={cx} x2={cx} y1={spendY0} y2={stripY0 + stripH}
              stroke="#111" strokeWidth={1} strokeDasharray="2,2" opacity={0.3}
              pointerEvents="none" />
          );
        })}

        {/* ══ Invisible click / hover targets ══════════════════════════════ */}
        {sims.map((s) => {
          const x = ml + ((s.startYear - firstYear) / (span + 1)) * innerW;
          return (
            <rect key={`hit-${s.startYear}`}
              x={x} y={spendY0} width={Math.max(1, colW)} height={stripY0 + stripH - spendY0}
              fill="transparent"
              onClick={(e) => onToggle?.(s.startYear, e)}
              onMouseEnter={() => setHovered(s.startYear)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: onToggle ? 'pointer' : 'default' }} />
          );
        })}

        {/* ══ Marquee drag overlay ══════════════════════════════════════════ */}
        {drag && (
          <rect
            x={Math.min(drag.x0, drag.x1)} y={spendY0}
            width={Math.abs(drag.x1 - drag.x0)} height={stripY0 + stripH - spendY0}
            fill="#357" fillOpacity={0.1} stroke="#357" strokeWidth={1} strokeDasharray="3,3"
            pointerEvents="none" />
        )}

        {/* ══ Hover tooltip ═════════════════════════════════════════════════ */}
        {hovered !== null && mousePos && (() => {
          const sim = sims.find((s) => s.startYear === hovered);
          if (!sim) return null;
          const balance = sim.inProgress ? (sim.finalBalance ?? 0) : sim.success ? (sim.finalBalance ?? 0) : 0;
          const spend = avgSpendOf(sim);
          const status = sim.inProgress
            ? 'in-progress'
            : sim.success
              ? 'survived'
              : `depleted yr ${sim.depletedAt}`;
          const lines = [
            { text: String(hovered), bold: true },
            { text: status, bold: false },
            { text: `terminal: ${fmt(balance)}`, bold: false },
            { text: `avg spend: ${fmt(spend)}/yr`, bold: false },
          ];
          const ttW = 148, ttH = lines.length * 15 + 14;
          let ttX = mousePos.x + 12;
          let ttY = mousePos.y - ttH / 2;
          if (ttX + ttW > W - mr) ttX = mousePos.x - ttW - 12;
          if (ttY < mt) ttY = mt;
          if (ttY + ttH > totalH - mb) ttY = totalH - mb - ttH;
          return (
            <g pointerEvents="none">
              <rect x={ttX} y={ttY} width={ttW} height={ttH}
                fill="white" stroke="#ccc" strokeWidth={1} rx={4}
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))" />
              {lines.map((l, i) => (
                <text key={i} x={ttX + 9} y={ttY + 13 + i * 15}
                  fontSize={11} fill={l.bold ? '#111' : '#555'}
                  fontWeight={l.bold ? '600' : 'normal'}>
                  {l.text}
                </text>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
