import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line as d3line } from 'd3-shape';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { ASSET } from '../colors';

type Props = {
  result?: ScenarioResult;
  selectedYears?: Set<number>;
  sim?: SimulationResult;
  width?: number;
  height?: number;
};

/**
 * Stacked-area view of one sim's per-sleeve balances over time. Bottom band
 * is stocks, middle is bonds, top is cash. Refill events for the bucket
 * source show up visually as cash band suddenly growing while the stock
 * band shrinks.
 *
 * Pass a sim directly, or a result + selection to pick one by:
 *   - the single selected start year, if exactly one is selected
 *   - else the most recent fully-completed start year
 */
export function SleeveChart({
  result,
  selectedYears,
  sim: simProp,
  width = 800,
  height = 320,
}: Props) {
  const sim = useMemo(
    () =>
      simProp ?? (result ? pickSim(result, selectedYears ?? new Set()) : null),
    [simProp, result, selectedYears],
  );
  if (!sim) return null;

  const margin = { top: 16, right: 16, bottom: 36, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const points = sim.trajectory.map((r) => ({
    t: r.t,
    stock: r.sleeves.stock,
    bond: r.sleeves.bond,
    cash: r.sleeves.cash,
    total: r.sleeves.stock + r.sleeves.bond + r.sleeves.cash,
  }));
  const horizon = points.length;
  const yMax = points.reduce((m, p) => Math.max(m, p.total), 0) || 1;

  const x = scaleLinear().domain([0, Math.max(1, horizon - 1)]).range([0, innerW]);
  const y = scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

  // Stack from the bottom up: stocks, then bonds, then cash on top.
  type Stacked = { t: number; y0: number; y1: number };
  const stockBand: Stacked[] = points.map((p) => ({ t: p.t, y0: 0, y1: p.stock }));
  const bondBand: Stacked[] = points.map((p) => ({
    t: p.t,
    y0: p.stock,
    y1: p.stock + p.bond,
  }));
  const cashBand: Stacked[] = points.map((p) => ({
    t: p.t,
    y0: p.stock + p.bond,
    y1: p.stock + p.bond + p.cash,
  }));

  const areaGen = area<Stacked>()
    .x((d) => x(d.t))
    .y0((d) => y(d.y0))
    .y1((d) => y(d.y1));
  const lineGen = d3line<{ t: number; v: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.v));

  // Cash fraction over time — handy second-axis-style overlay.
  const cashFracPath = lineGen(
    points.map((p) => ({ t: p.t, v: p.total > 0 ? (p.cash / p.total) * yMax : 0 })),
  );

  const yTicks = y.ticks(5);
  const xTicks = x.ticks(Math.min(8, horizon));

  const status =
    !sim.success && !sim.inProgress ? 'depleted' : sim.inProgress ? 'in-progress' : 'survived';

  const fmt = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`;

  const final = points[points.length - 1];

  return (
    <div>
      <div className="heatmap-meta">
        Sleeve composition for the <strong>{sim.startYear}</strong> retiree — {status}.{' '}
        Final {fmt(final.total)} = {fmt(final.stock)} stocks + {fmt(final.bond)} bonds + {fmt(final.cash)} cash.
        {!simProp && selectedYears && selectedYears.size === 0 && (
          <em> Click a year in the strip or spaghetti to switch.</em>
        )}
      </div>
      <svg width={width} height={height} className="spaghetti">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {yTicks.map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={0} x2={innerW} stroke="#eee" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="#666">
                {fmt(v)}
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
          <path d={areaGen(stockBand) ?? ''} fill={ASSET.stock} fillOpacity={0.85} />
          <path d={areaGen(bondBand) ?? ''} fill={ASSET.bond} fillOpacity={0.85} />
          <path d={areaGen(cashBand) ?? ''} fill={ASSET.cash} fillOpacity={0.85} />
          {/* Faint outline on cash fraction (as % of yMax for visibility) */}
          <path
            d={cashFracPath ?? ''}
            fill="none"
            stroke="#fff"
            strokeOpacity={0.4}
            strokeWidth={0.5}
          />
          <text
            transform={`translate(${-48},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="#444"
          >
            balance (real $)
          </text>
          <text x={innerW / 2} y={innerH + 32} textAnchor="middle" fontSize={11} fill="#444">
            years into retirement
          </text>
        </g>
      </svg>
      <ul className="legend-row" style={{ marginTop: 4 }}>
        <li>
          <span className="sw" style={{ background: ASSET.stock }} /> stocks
        </li>
        <li>
          <span className="sw" style={{ background: ASSET.bond }} /> bonds
        </li>
        <li>
          <span className="sw" style={{ background: ASSET.cash }} /> cash
        </li>
      </ul>
    </div>
  );
}

function pickSim(
  result: ScenarioResult,
  selected: Set<number>,
): SimulationResult | null {
  // Exactly one start year selected → that one (prefer non-bootstrap, non-duplicate).
  if (selected.size === 1) {
    const [year] = [...selected];
    const match = result.sims.find((s) => s.startYear === year);
    if (match) return match;
  }
  // Default: most recent fully-completed sim. Falls back to the latest sim if
  // nothing is fully completed (which would mean we're in truncate mode with
  // a long horizon).
  const completed = result.sims.filter((s) => !s.inProgress && !s.bootstrapped);
  const pool = completed.length ? completed : result.sims;
  return pool.reduce<SimulationResult | null>(
    (best, s) => (!best || s.startYear > best.startYear ? s : best),
    null,
  );
}
