import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { CURRENT_COLOR, SNAPSHOT_COLOR } from '../../store/compareStore';

type Hover = {
  sim: SimulationResult;
  source: 'current' | 'snapshot';
  px: number;
  py: number;
};

type Props = {
  result: ScenarioResult;
  /** Optional second result drawn on the same axes for A/B comparison. */
  overlay?: ScenarioResult | null;
  width?: number;
  height?: number;
  /** When non-empty, only sims whose startYear is in this set render at full
   * intensity; the rest fade out so highlighted runs pop. */
  selectedYears?: Set<number>;
  /** Click on a line toggles its start year in the selection. */
  onToggle?: (year: number, e: React.MouseEvent) => void;
  /** Marquee handler: receives the years whose trajectories enter the rect. */
  onMarquee?: (years: number[], e: { shiftKey: boolean }) => void;
};

export function SpaghettiChart({
  result,
  overlay = null,
  width = 800,
  height = 460,
  selectedYears,
  onToggle,
  onMarquee,
}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<
    null | { x0: number; y0: number; x1: number; y1: number }
  >(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;
  const margin = { top: 16, right: 16, bottom: 36, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const hasSelection = !!selectedYears && selectedYears.size > 0;

  const horizon = useMemo(() => {
    const a = result.sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0);
    const b = overlay
      ? overlay.sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0)
      : 0;
    return Math.max(a, b);
  }, [result.sims, overlay]);

  const maxBalance = useMemo(() => {
    let m = 0;
    const scan = (sims: SimulationResult[]) => {
      for (const s of sims)
        for (const r of s.trajectory) if (r.balance > m) m = r.balance;
    };
    scan(result.sims);
    if (overlay) scan(overlay.sims);
    return m || 1;
  }, [result.sims, overlay]);

  const x = scaleLinear()
    .domain([0, Math.max(1, horizon - 1)])
    .range([0, innerW]);
  const y = scaleLinear().domain([0, maxBalance]).range([innerH, 0]).nice();

  const lineGen = line<{ t: number; balance: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.balance));

  const yTicks = y.ticks(5);
  const xTicks = x.ticks(Math.min(8, horizon));

  // Marquee selection. shift+mousedown anywhere over the plot starts a drag;
  // mousemove updates the rect; mouseup commits the union of years whose
  // trajectories pass through the rect. Coords are in inner-group space
  // (offset minus margins) to match where the lines are rendered.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left - margin.left;
      const py = e.clientY - rect.top - margin.top;
      setDrag((d) => (d ? { ...d, x1: px, y1: py } : d));
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !onMarquee) return;
      const xLo = Math.min(d.x0, d.x1);
      const xHi = Math.max(d.x0, d.x1);
      const yLo = Math.min(d.y0, d.y1);
      const yHi = Math.max(d.y0, d.y1);
      // Ignore tiny drags so a stray shift+click doesn't trigger marquee.
      if (xHi - xLo < 3 && yHi - yLo < 3) return;
      const tLo = x.invert(xLo);
      const tHi = x.invert(xHi);
      // y is inverted (top = high balance), so swap when going through invert.
      const balLo = y.invert(yHi);
      const balHi = y.invert(yLo);
      const within = new Set<number>();
      const scan = (sims: SimulationResult[]) => {
        for (const s of sims) {
          for (const r of s.trajectory) {
            if (r.t >= tLo && r.t <= tHi && r.balance >= balLo && r.balance <= balHi) {
              within.add(s.startYear);
              break;
            }
          }
        }
      };
      scan(result.sims);
      if (overlay) scan(overlay.sims);
      onMarquee([...within], { shiftKey: e.shiftKey });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, onMarquee, x, y, result.sims, overlay]);

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onMarquee || !e.shiftKey) return;
    const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left - margin.left;
    const py = e.clientY - rect.top - margin.top;
    setDrag({ x0: px, y0: py, x1: px, y1: py });
    e.preventDefault();
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="spaghetti"
      onMouseDown={onSvgMouseDown}
      style={drag ? { cursor: 'crosshair', userSelect: 'none' } : undefined}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        {yTicks.map((v) => (
          <g key={v} transform={`translate(0,${y(v)})`}>
            <line x1={0} x2={innerW} stroke="#eee" />
            <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="#666">
              ${(v / 1e6).toFixed(1)}M
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={v} transform={`translate(${x(v)},${innerH})`}>
            <line y1={0} y2={6} stroke="#999" />
            <text y={20} textAnchor="middle" fontSize={11} fill="#666">
              y{v}
            </text>
          </g>
        ))}
        {result.sims.map((s) => (
          <SimLine
            key={`a-${s.startYear}`}
            sim={s}
            lineGen={lineGen}
            color={CURRENT_COLOR}
            highlighted={
              (hover?.source === 'current' && hover.sim.startYear === s.startYear) ||
              (hasSelection && selectedYears!.has(s.startYear))
            }
            dimmed={hasSelection && !selectedYears!.has(s.startYear)}
            onHover={(e) =>
              setHover({
                sim: s,
                source: 'current',
                px: e.nativeEvent.offsetX,
                py: e.nativeEvent.offsetY,
              })
            }
            onLeave={() => setHover(null)}
            onClick={onToggle ? (e) => onToggle(s.startYear, e) : undefined}
          />
        ))}
        {overlay?.sims.map((s) => (
          <SimLine
            key={`b-${s.startYear}`}
            sim={s}
            lineGen={lineGen}
            color={SNAPSHOT_COLOR}
            highlighted={
              (hover?.source === 'snapshot' && hover.sim.startYear === s.startYear) ||
              (hasSelection && selectedYears!.has(s.startYear))
            }
            dimmed={hasSelection && !selectedYears!.has(s.startYear)}
            onHover={(e) =>
              setHover({
                sim: s,
                source: 'snapshot',
                px: e.nativeEvent.offsetX,
                py: e.nativeEvent.offsetY,
              })
            }
            onLeave={() => setHover(null)}
            onClick={onToggle ? (e) => onToggle(s.startYear, e) : undefined}
          />
        ))}
        <text
          transform={`translate(${-48},${innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={11}
          fill="#444"
        >
          balance (real $)
        </text>
        <text
          x={innerW / 2}
          y={innerH + 32}
          textAnchor="middle"
          fontSize={11}
          fill="#444"
        >
          years into retirement
        </text>
        {drag && (
          <rect
            x={Math.min(drag.x0, drag.x1)}
            y={Math.min(drag.y0, drag.y1)}
            width={Math.abs(drag.x1 - drag.x0)}
            height={Math.abs(drag.y1 - drag.y0)}
            fill="#357"
            fillOpacity={0.08}
            stroke="#357"
            strokeWidth={1}
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}
      </g>
      {hover && <Tooltip hover={hover} />}
    </svg>
  );
}

function Tooltip({ hover }: { hover: Hover }) {
  const { sim, px, py } = hover;
  const last = sim.trajectory[sim.trajectory.length - 1];
  const status = !sim.success && !sim.inProgress ? 'depleted' : sim.inProgress ? 'in-progress' : 'survived';
  const fmt = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`;
  const lines = [
    `start ${sim.startYear} — ${status}`,
    sim.depletedAt != null
      ? `depleted at year ${sim.depletedAt}`
      : `final ${fmt(last?.balance ?? 0)} (year ${last?.t ?? 0})`,
  ];
  return (
    <g transform={`translate(${px + 12},${py + 12})`} pointerEvents="none">
      <rect
        x={0}
        y={-26}
        width={200}
        height={36}
        fill="#fff"
        stroke="#bbb"
        strokeWidth={0.5}
        rx={3}
      />
      {lines.map((l, i) => (
        <text key={i} x={6} y={-12 + i * 14} fontSize={11} fill="#222">
          {l}
        </text>
      ))}
    </g>
  );
}

function SimLine({
  sim,
  lineGen,
  color,
  highlighted,
  dimmed,
  onHover,
  onLeave,
  onClick,
}: {
  sim: SimulationResult;
  lineGen: ReturnType<typeof line<{ t: number; balance: number }>>;
  color: string;
  highlighted: boolean;
  dimmed: boolean;
  onHover: (e: React.MouseEvent<SVGPathElement>) => void;
  onLeave: () => void;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const points = sim.trajectory.map((r) => ({ t: r.t, balance: r.balance }));
  const failed = !sim.success && !sim.inProgress;
  const stroke = failed ? '#d33' : sim.inProgress ? '#888' : color;
  const baseOpacity = failed ? 0.55 : sim.inProgress ? 0.35 : 0.2;
  const opacity = highlighted ? 1 : dimmed ? 0.04 : baseOpacity;
  const strokeWidth = highlighted ? 2 : 1;
  const handlers = {
    onMouseEnter: onHover,
    onMouseMove: onHover,
    onMouseLeave: onLeave,
    onClick,
    style: { cursor: onClick ? ('pointer' as const) : ('crosshair' as const) },
  };

  // Bootstrap sims: render the actual-data prefix solid, the sampled tail
  // dashed/translucent so users can tell observed from sampled at a glance.
  if (sim.bootstrapped && sim.prefixYears < points.length) {
    const prefix = points.slice(0, sim.prefixYears);
    const tail = points.slice(sim.prefixYears - 1);
    return (
      <g {...handlers}>
        <path
          d={lineGen(prefix) ?? ''}
          fill="none"
          stroke={stroke}
          strokeOpacity={opacity}
          strokeWidth={strokeWidth}
        />
        <path
          d={lineGen(tail) ?? ''}
          fill="none"
          stroke={stroke}
          strokeOpacity={opacity * 0.5}
          strokeWidth={strokeWidth}
          strokeDasharray="2,3"
        />
      </g>
    );
  }
  return (
    <path
      d={lineGen(points) ?? ''}
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={strokeWidth}
      {...handlers}
    />
  );
}
