import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { line, area } from 'd3-shape';
import { computePercentilesFiltered, quantile } from '../../engine/stats';
import type {
  ScenarioResult,
  SimulationResult,
} from '../../engine/types';

type Props = {
  result: ScenarioResult;
  horizonYears: number;
  initialBalance: number;
  dataEnd: number;
};

/**
 * For each retiree whose horizon hasn't fully played out yet, plot their
 * realized prefix against the historical (completed) percentile band. Answers
 * "how is the 2008 retiree doing relative to historical peers at year 17?"
 * without speculation about the unrealized tail.
 *
 * Works in either tail mode:
 *   truncate: in-progress sims have a short trajectory; that IS the prefix.
 *   bootstrap: each in-progress start year has many sims sharing a prefix; we
 *              just take the first one and read prefixYears for length.
 */
export function WhereAmI({
  result,
  horizonYears,
  initialBalance,
  dataEnd,
}: Props) {
  // Group recent-retiree sims by start year.
  const recentByYear = useMemo(() => {
    const map = new Map<number, SimulationResult>();
    for (const s of result.sims) {
      if (s.inProgress || s.bootstrapped) {
        // For bootstrap mode, multiple sims share the same prefix; we only
        // need one to render the realized line.
        if (!map.has(s.startYear)) map.set(s.startYear, s);
      }
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [result.sims]);

  // Historical band built from fully-completed, non-bootstrapped sims only.
  const histBand = useMemo(
    () =>
      computePercentilesFiltered(
        result.sims,
        horizonYears,
        (s) => !s.inProgress && !s.bootstrapped,
      ),
    [result.sims, horizonYears],
  );

  // Per-t arrays of completed-historical balances, for percentile-rank lookup.
  const histBalancesPerT = useMemo(() => {
    const out: number[][] = [];
    for (let t = 0; t < horizonYears; t++) {
      const arr: number[] = [];
      for (const s of result.sims) {
        if (s.inProgress || s.bootstrapped) continue;
        const r = s.trajectory[t];
        if (r) arr.push(r.balance);
      }
      arr.sort((a, b) => a - b);
      out.push(arr);
    }
    return out;
  }, [result.sims, horizonYears]);

  if (recentByYear.length === 0) {
    return (
      <div className="where-empty">
        No in-progress retirees with this horizon — every start year has
        finished playing out.
      </div>
    );
  }

  return (
    <div>
      <div className="heatmap-meta">
        Where Am I — recent retirees whose horizon hasn't fully played out yet,
        plotted against historical peers at the same year-into-retirement.
      </div>
      <div className="multiples-grid">
        {recentByYear.map(([startYear, sim]) => (
          <Card
            key={startYear}
            sim={sim}
            histBand={histBand}
            histBalancesPerT={histBalancesPerT}
            startYear={startYear}
            horizonYears={horizonYears}
            initialBalance={initialBalance}
            dataEnd={dataEnd}
          />
        ))}
      </div>
    </div>
  );
}

type CardProps = {
  sim: SimulationResult;
  histBand: ReturnType<typeof computePercentilesFiltered>;
  histBalancesPerT: number[][];
  startYear: number;
  horizonYears: number;
  initialBalance: number;
  dataEnd: number;
};

function Card({
  sim,
  histBand,
  histBalancesPerT,
  startYear,
  horizonYears,
  initialBalance,
  dataEnd,
}: CardProps) {
  const W = 320;
  const H = 200;
  const margin = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  // Realized prefix: in truncate mode this is the whole trajectory. In
  // bootstrap mode it's the first prefixYears; the rest is sampled.
  const prefixLen = sim.inProgress ? sim.trajectory.length : sim.prefixYears;
  const prefix = sim.trajectory.slice(0, prefixLen);
  const tCurrent = prefix.length - 1;
  const currentBalance = prefix[tCurrent]?.balance ?? initialBalance;

  // Y domain: use both the realized prefix and the historical p95.
  const histMax = histBand.reduce((m, b) => Math.max(m, b.values.p95), 0);
  const realizedMax = prefix.reduce((m, p) => Math.max(m, p.balance), 0);
  const yMax = Math.max(histMax, realizedMax) || initialBalance;

  const x = scaleLinear().domain([0, horizonYears - 1]).range([0, innerW]);
  const y = scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

  const bandArea = area<{ t: number; lo: number; hi: number }>()
    .x((d) => x(d.t))
    .y0((d) => y(d.lo))
    .y1((d) => y(d.hi));
  const medianLine = line<{ t: number; v: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.v));
  const realizedLine = line<{ t: number; balance: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.balance));

  const innerBand = histBand.map((b) => ({
    t: b.t,
    lo: b.values.p25,
    hi: b.values.p75,
  }));
  const outerBand = histBand.map((b) => ({
    t: b.t,
    lo: b.values.p5,
    hi: b.values.p95,
  }));
  const median = histBand.map((b) => ({ t: b.t, v: b.values.p50 }));

  // Percentile rank of the current balance within historical peers at year tCurrent.
  const rank = percentileRank(histBalancesPerT[tCurrent] ?? [], currentBalance);
  const peerMedian = histBalancesPerT[tCurrent]
    ? quantile(histBalancesPerT[tCurrent], 0.5)
    : NaN;

  const fmt$ = (n: number): string => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
    return `$${Math.round(n)}`;
  };

  return (
    <div className="multiple where-card">
      <div className="multiple-title">
        Started {startYear}. At year {tCurrent + 1} ({startYear + tCurrent}),
        currently tracking the {Number.isFinite(rank) ? Math.round(rank * 100) : '—'}
        th percentile of historical {tCurrent + 1}-year-in trajectories.
        Median peer: {Number.isFinite(peerMedian) ? fmt$(peerMedian) : '—'}.
      </div>
      <svg width={W} height={H} className="spaghetti">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {y.ticks(4).map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={0} x2={innerW} stroke="#eee" />
              <text x={-6} dy="0.32em" textAnchor="end" fontSize={10} fill="#666">
                {fmt$(v)}
              </text>
            </g>
          ))}
          <path d={bandArea(outerBand) ?? ''} fill="#357" fillOpacity={0.08} />
          <path d={bandArea(innerBand) ?? ''} fill="#357" fillOpacity={0.16} />
          <path d={medianLine(median) ?? ''} fill="none" stroke="#357" strokeWidth={1.2} strokeDasharray="3,3" />
          <path
            d={realizedLine(prefix) ?? ''}
            fill="none"
            stroke="#c44"
            strokeWidth={2}
          />
          <circle cx={x(tCurrent)} cy={y(currentBalance)} r={3.5} fill="#c44" />
          <text
            x={innerW / 2}
            y={innerH + 22}
            textAnchor="middle"
            fontSize={10}
            fill="#666"
          >
            year (data through {dataEnd})
          </text>
        </g>
      </svg>
    </div>
  );
}

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return NaN;
  // Average rank — count strictly-below + 0.5 * equal.
  let lo = 0;
  let eq = 0;
  for (const v of sorted) {
    if (v < value) lo++;
    else if (v === value) eq++;
    else break;
  }
  return (lo + 0.5 * eq) / sorted.length;
}
