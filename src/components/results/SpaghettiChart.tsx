import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { CURRENT_COLOR, SNAPSHOT_COLOR } from '../../store/compareStore';

type Props = {
  result: ScenarioResult;
  /** Optional second result drawn on the same axes for A/B comparison. */
  overlay?: ScenarioResult | null;
  width?: number;
  height?: number;
};

export function SpaghettiChart({
  result,
  overlay = null,
  width = 800,
  height = 460,
}: Props) {
  const margin = { top: 16, right: 16, bottom: 36, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

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
          />
        ))}
        {overlay?.sims.map((s) => (
          <SimLine
            key={`b-${s.startYear}`}
            sim={s}
            lineGen={lineGen}
            color={SNAPSHOT_COLOR}
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
    </svg>
  );
}

function SimLine({
  sim,
  lineGen,
  color,
}: {
  sim: SimulationResult;
  lineGen: ReturnType<typeof line<{ t: number; balance: number }>>;
  color: string;
}) {
  const points = sim.trajectory.map((r) => ({ t: r.t, balance: r.balance }));
  const d = lineGen(points) ?? '';
  const failed = !sim.success && !sim.inProgress;
  const inProgress = sim.inProgress;
  return (
    <path
      d={d}
      fill="none"
      stroke={failed ? '#d33' : inProgress ? '#888' : color}
      strokeOpacity={failed ? 0.55 : inProgress ? 0.35 : 0.2}
      strokeWidth={1}
    />
  );
}
