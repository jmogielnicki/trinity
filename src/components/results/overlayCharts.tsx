import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { fmtMoney } from '../../engine/strategyDescriptions';
import { quantile } from '../../engine/stats';
import type { CandidateMetrics } from '../../engine/optimize';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { withAlpha } from '../seriesColors';

export type YearMode = 'worst' | 'median' | 'best';

/**
 * The minimal shape the overlay charts need from each strategy. Both the
 * compare view (built from saved scenarios) and the optimize study (built from
 * swept candidates) adapt their richer result types down to this.
 */
export type Series = {
  id: string;
  label: string;
  color: string;
  metrics: CandidateMetrics;
  result: ScenarioResult;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function moneyAxis(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border-light rounded-lg p-3 bg-surface min-w-0">
      <div className="font-display text-lg font-bold text-text mb-2.5">{title}</div>
      {children}
    </div>
  );
}

type BoxPoint = {
  low: number;
  q1: number;
  median: number;
  q3: number;
  high: number;
  color: string;
  fillColor: string;
  medianColor: string;
};

// ---------------------------------------------------------------------------
// Distribution boxplots — p5 / p25 / median / p75 / p95
// ---------------------------------------------------------------------------

function boxPoint(
  color: string,
  q: { p5: number; p25: number; p50: number; p75: number; p95: number },
): BoxPoint {
  return {
    low: q.p5,
    q1: q.p25,
    median: q.p50,
    q3: q.p75,
    high: q.p95,
    color,
    fillColor: withAlpha(color, 0.22),
    medianColor: color,
  };
}

function DistributionBoxplot({
  title,
  axisTitle,
  series,
  data,
}: {
  title: string;
  axisTitle: string;
  series: Series[];
  data: BoxPoint[];
}) {
  const categories = series.map((s) => truncate(s.label, 24));
  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'boxplot',
        inverted: true,
        width: null as any,
        height: Math.max(150, series.length * 38 + 56),
        margin: [10, 16, 36, 8],
      },
      xAxis: { categories, labels: { enabled: false }, lineWidth: 0, tickWidth: 0 },
      yAxis: {
        min: 0,
        title: { text: axisTitle },
        labels: {
          formatter() {
            return moneyAxis(this.value as number);
          },
        },
      },
      tooltip: {
        formatter() {
          const ctx = this as any;
          const p = ctx.point ?? {};
          return `<b>${ctx.key}</b><br/>
            p95 ${fmtMoney(p.high)}<br/>
            p75 ${fmtMoney(p.q3)}<br/>
            median ${fmtMoney(p.median)}<br/>
            p25 ${fmtMoney(p.q1)}<br/>
            p5 ${fmtMoney(p.low)}`;
        },
      },
      plotOptions: {
        boxplot: { lineWidth: 1.5, medianWidth: 3, whiskerLength: '60%' },
      },
      legend: { enabled: false },
      series: [{ type: 'boxplot', data } as any],
    }),
    [categories, data, axisTitle, series.length],
  );

  return (
    <ChartCard title={title}>
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

export function FinalBalanceDistributionChart({ series }: { series: Series[] }) {
  const data = series.map((s) =>
    boxPoint(s.color, {
      p5: s.metrics.p5Final,
      p25: s.metrics.p25Final,
      p50: s.metrics.p50Final,
      p75: s.metrics.p75Final,
      p95: s.metrics.p95Final,
    }),
  );
  return (
    <DistributionBoxplot
      title="Final balance distribution"
      axisTitle="final balance (real $)"
      series={series}
      data={data}
    />
  );
}

/** Distribution of per-sim average annual spend, over completed observed sims. */
function spendQuantiles(s: Series) {
  const means: number[] = [];
  for (const sim of s.result.sims) {
    if (sim.bootstrapped || sim.inProgress || sim.trajectory.length === 0) continue;
    const sum = sim.trajectory.reduce((acc, r) => acc + r.withdrawal, 0);
    means.push(sum / sim.trajectory.length);
  }
  means.sort((a, b) => a - b);
  return {
    p5: quantile(means, 0.05),
    p25: quantile(means, 0.25),
    p50: quantile(means, 0.5),
    p75: quantile(means, 0.75),
    p95: quantile(means, 0.95),
  };
}

export function SpendDistributionChart({ series }: { series: Series[] }) {
  const data = series.map((s) => boxPoint(s.color, spendQuantiles(s)));
  return (
    <DistributionBoxplot
      title="Annual spend distribution"
      axisTitle="avg annual spend (real $)"
      series={series}
      data={data}
    />
  );
}

// ---------------------------------------------------------------------------
// Lines over years-into-retirement — representative balance and spend
// ---------------------------------------------------------------------------

function timeSeriesOptions(seriesData: any[]): Options {
  return {
    chart: { type: 'line', width: null as any, height: 320, margin: [16, 16, 48, 72] },
    xAxis: {
      title: { text: 'years into retirement' },
      labels: { style: { fontSize: '10px' } },
      allowDecimals: false,
    },
    yAxis: {
      min: 0,
      title: { text: '' },
      labels: {
        formatter() {
          return moneyAxis(this.value as number);
        },
      },
    },
    tooltip: {
      formatter() {
        const yr = this.x ?? 0;
        return `<b>${this.series.name}</b><br/>Year ${yr}: ${fmtMoney(this.y ?? 0)}`;
      },
    },
    legend: { enabled: false },
    series: seriesData,
  };
}

function lineSeries(s: Series, data: [number, number][]) {
  return {
    type: 'line',
    name: truncate(s.label, 28),
    color: s.color,
    lineWidth: 1.75,
    marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
    data,
  };
}

function endBalance(s: SimulationResult): number {
  return s.success ? s.finalBalance ?? s.trajectory[s.trajectory.length - 1]?.balance ?? 0 : 0;
}

function minBalance(s: SimulationResult): number {
  let m = Infinity;
  for (const rec of s.trajectory) if (rec.balance < m) m = rec.balance;
  return Number.isFinite(m) ? m : 0;
}

/**
 * Pick one actual start year per scenario to play out:
 *  - best: highest ending balance
 *  - median: middle-ranked ending balance
 *  - worst: soonest depletion if any cohort depleted; otherwise the cohort that
 *    came closest to depletion (lowest balance touched at any point)
 */
function representativeSim(s: Series, mode: YearMode): SimulationResult | undefined {
  const sims = s.result.sims.filter((x) => !x.bootstrapped && !x.inProgress);
  if (sims.length === 0) return undefined;

  if (mode === 'best') {
    return sims.reduce((best, x) => (endBalance(x) > endBalance(best) ? x : best));
  }
  if (mode === 'median') {
    const sorted = [...sims].sort((a, b) => endBalance(a) - endBalance(b));
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }
  // worst
  const depleted = sims.filter((x) => !x.success);
  if (depleted.length > 0) {
    return depleted.reduce((worst, x) =>
      (x.depletedAt ?? Infinity) < (worst.depletedAt ?? Infinity) ? x : worst,
    );
  }
  return sims.reduce((worst, x) => (minBalance(x) < minBalance(worst) ? x : worst));
}

function trajectoryOptions(seriesData: any[]): Options {
  return {
    ...timeSeriesOptions(seriesData),
    tooltip: {
      formatter() {
        const yr = this.x ?? 0;
        const startYear = (this.series.options as any).custom?.startYear;
        const label = startYear ? ` · started ${startYear}` : '';
        return `<b>${this.series.name}</b>${label}<br/>Year ${yr}: ${fmtMoney(this.y ?? 0)}`;
      },
    },
  };
}

function trajectorySeries(
  series: Series[],
  mode: YearMode,
  valueOf: (rec: SimulationResult['trajectory'][number]) => number,
) {
  return series.map((s) => {
    const sim = representativeSim(s, mode);
    return {
      ...lineSeries(s, sim ? sim.trajectory.map((rec) => [rec.t, valueOf(rec)]) : []),
      custom: { startYear: sim?.startYear },
    };
  });
}

export function BalanceOverTimeChart({
  series,
  mode,
}: {
  series: Series[];
  mode: YearMode;
}) {
  const seriesData = useMemo(
    () => trajectorySeries(series, mode, (rec) => rec.balance),
    [series, mode],
  );
  const options = useMemo(() => trajectoryOptions(seriesData), [seriesData]);
  return (
    <ChartCard title="Balance over the retirement">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

export function SpendOverTimeChart({
  series,
  mode,
}: {
  series: Series[];
  mode: YearMode;
}) {
  const seriesData = useMemo(
    () => trajectorySeries(series, mode, (rec) => rec.withdrawal),
    [series, mode],
  );
  const options = useMemo(() => trajectoryOptions(seriesData), [seriesData]);
  return (
    <ChartCard title="Spending over the retirement">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}
