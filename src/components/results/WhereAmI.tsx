import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { computePercentilesFiltered, quantile } from '../../engine/stats';
import type {
  ScenarioResult,
  SimulationResult,
} from '../../engine/types';
import { CHART, OUTCOME } from '../colors';

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
      <div className="text-base text-text-faint px-4 py-4 text-center">
        No in-progress retirees with this horizon — every start year has
        finished playing out.
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm text-text-secondary mb-2">
        Where Am I — recent retirees whose horizon hasn't fully played out yet,
        plotted against historical peers at the same year-into-retirement.
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] gap-3 mt-2">
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

const fmt$ = (n: number): string => {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

function Card({
  sim,
  histBand,
  histBalancesPerT,
  startYear,
  horizonYears,
  dataEnd,
  initialBalance,
}: CardProps) {
  const W = 320;
  const H = 200;

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

  // Percentile rank of the current balance within historical peers at year tCurrent.
  const rank = percentileRank(histBalancesPerT[tCurrent] ?? [], currentBalance);
  const peerMedian = histBalancesPerT[tCurrent]
    ? quantile(histBalancesPerT[tCurrent], 0.5)
    : NaN;

  const options: Options = useMemo(() => {
    const outerBandData = histBand.map((b) => [b.t, b.values.p5, b.values.p95] as [number, number, number]);
    const innerBandData = histBand.map((b) => [b.t, b.values.p25, b.values.p75] as [number, number, number]);
    const medianData = histBand.map((b) => [b.t, b.values.p50] as [number, number]);
    const prefixData = prefix.map((r) => [r.t, r.balance] as [number, number]);
    const dotData = [[tCurrent, currentBalance] as [number, number]];

    return {
      chart: {
        width: W,
        height: H,
        margin: [12, 12, 28, 48],
      },
      xAxis: {
        min: 0,
        max: horizonYears - 1,
        title: { text: `year (data through ${dataEnd})`, style: { color: CHART.muted, fontSize: '10px' } },
        tickInterval: Math.ceil((horizonYears - 1) / 5) || 1,
        labels: { style: { fontSize: '10px' } },
      },
      yAxis: {
        min: 0,
        max: yMax,
        title: { text: '' },
        labels: {
          style: { fontSize: '10px' },
          formatter() {
            return fmt$(this.value as number);
          },
        },
        tickAmount: 4,
      },
      tooltip: { enabled: false },
      series: [
        {
          type: 'arearange',
          data: outerBandData,
          color: CHART.accent,
          fillOpacity: 0.08,
          lineWidth: 0,
          enableMouseTracking: false,
          marker: { enabled: false },
          zIndex: 1,
        },
        {
          type: 'arearange',
          data: innerBandData,
          color: CHART.accent,
          fillOpacity: 0.16,
          lineWidth: 0,
          enableMouseTracking: false,
          marker: { enabled: false },
          zIndex: 2,
        },
        {
          type: 'line',
          data: medianData,
          color: CHART.accent,
          lineWidth: 1.2,
          dashStyle: 'ShortDash',
          enableMouseTracking: false,
          marker: { enabled: false },
          zIndex: 3,
        },
        {
          type: 'line',
          data: prefixData,
          color: OUTCOME.snapshot,
          lineWidth: 2,
          enableMouseTracking: false,
          marker: { enabled: false },
          zIndex: 4,
        },
        {
          type: 'scatter',
          data: dotData,
          color: OUTCOME.snapshot,
          marker: {
            enabled: true,
            radius: 3.5,
            symbol: 'circle',
          },
          enableMouseTracking: false,
          zIndex: 5,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histBand, prefix, tCurrent, currentBalance, horizonYears, yMax, dataEnd]);

  return (
    <div className="border border-border-light rounded p-2">
      <div className="text-xs text-text-secondary mb-1">
        Started {startYear}. At year {tCurrent + 1} ({startYear + tCurrent}),
        currently tracking the {Number.isFinite(rank) ? Math.round(rank * 100) : '—'}
        th percentile of historical {tCurrent + 1}-year-in trajectories.
        Median peer: {Number.isFinite(peerMedian) ? fmt$(peerMedian) : '—'}.
      </div>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        immutable={false}
      />
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
