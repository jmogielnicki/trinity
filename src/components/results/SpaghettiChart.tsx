import { useMemo, useState } from 'react';
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
};

export function SpaghettiChart({
  result,
  overlay = null,
  width = 800,
  height = 460,
  selectedYears,
  onToggle,
}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
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

  return (
    <svg width={width} height={height} className="spaghetti">
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
