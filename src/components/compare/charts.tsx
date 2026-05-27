import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { fmtMoney } from '../../engine/strategyDescriptions';
import { quantile } from '../../engine/stats';
import type { SimulationResult } from '../../engine/types';
import type { CompareEntry } from '../../store/compareScenariosStore';
import { colorAt, withAlpha } from './compareColors';

export type YearMode = 'worst' | 'median' | 'best';

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
    <div className="border border-border-light rounded p-2 bg-surface-page min-w-0">
      <div className="text-xs text-text-secondary mb-1.5">{title}</div>
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
// Distribution boxplots — p5 / p25 / median / p75 / p95 (shared)
// ---------------------------------------------------------------------------

function boxPoint(
  i: number,
  q: { p5: number; p25: number; p50: number; p75: number; p95: number },
): BoxPoint {
  const color = colorAt(i);
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
  entries,
  data,
}: {
  title: string;
  axisTitle: string;
  entries: CompareEntry[];
  data: BoxPoint[];
}) {
  const categories = entries.map((e) => truncate(e.saved.name, 24));
  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'boxplot',
        inverted: true,
        width: null as any,
        height: Math.max(150, entries.length * 38 + 56),
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
    [categories, data, axisTitle, entries.length],
  );

  return (
    <ChartCard title={title}>
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

export function FinalBalanceDistributionChart({ entries }: { entries: CompareEntry[] }) {
  const data = entries.map((e, i) =>
    boxPoint(i, {
      p5: e.metrics.p5Final,
      p25: e.metrics.p25Final,
      p50: e.metrics.p50Final,
      p75: e.metrics.p75Final,
      p95: e.metrics.p95Final,
    }),
  );
  return (
    <DistributionBoxplot
      title="Final-balance distribution (p5–p95, median bar)"
      axisTitle="final balance (real $)"
      entries={entries}
      data={data}
    />
  );
}

/** Distribution of per-sim average annual spend, over completed observed sims. */
function spendQuantiles(e: CompareEntry) {
  const means: number[] = [];
  for (const s of e.result.sims) {
    if (s.bootstrapped || s.inProgress || s.trajectory.length === 0) continue;
    const sum = s.trajectory.reduce((acc, r) => acc + r.withdrawal, 0);
    means.push(sum / s.trajectory.length);
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

export function SpendDistributionChart({ entries }: { entries: CompareEntry[] }) {
  const data = entries.map((e, i) => boxPoint(i, spendQuantiles(e)));
  return (
    <DistributionBoxplot
      title="Avg annual spend distribution (p5–p95, median bar)"
      axisTitle="avg annual spend (real $)"
      entries={entries}
      data={data}
    />
  );
}

// ---------------------------------------------------------------------------
// Lines over years-into-retirement — median balance and median spend
// ---------------------------------------------------------------------------

function timeSeriesOptions(series: any[]): Options {
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
    series,
  };
}

function lineSeries(e: CompareEntry, i: number, data: [number, number][]) {
  return {
    type: 'line',
    name: truncate(e.saved.name, 28),
    color: colorAt(i),
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
function representativeSim(e: CompareEntry, mode: YearMode): SimulationResult | undefined {
  const sims = e.result.sims.filter((s) => !s.bootstrapped && !s.inProgress);
  if (sims.length === 0) return undefined;

  if (mode === 'best') {
    return sims.reduce((best, s) => (endBalance(s) > endBalance(best) ? s : best));
  }
  if (mode === 'median') {
    const sorted = [...sims].sort((a, b) => endBalance(a) - endBalance(b));
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }
  // worst
  const depleted = sims.filter((s) => !s.success);
  if (depleted.length > 0) {
    return depleted.reduce((worst, s) =>
      (s.depletedAt ?? Infinity) < (worst.depletedAt ?? Infinity) ? s : worst,
    );
  }
  return sims.reduce((worst, s) => (minBalance(s) < minBalance(worst) ? s : worst));
}

function trajectoryOptions(series: any[]): Options {
  return {
    ...timeSeriesOptions(series),
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
  entries: CompareEntry[],
  mode: YearMode,
  valueOf: (rec: SimulationResult['trajectory'][number]) => number,
) {
  return entries.map((e, i) => {
    const sim = representativeSim(e, mode);
    return {
      ...lineSeries(e, i, sim ? sim.trajectory.map((rec) => [rec.t, valueOf(rec)]) : []),
      custom: { startYear: sim?.startYear },
    };
  });
}

export function BalanceOverTimeChart({
  entries,
  mode,
}: {
  entries: CompareEntry[];
  mode: YearMode;
}) {
  const series = useMemo(
    () => trajectorySeries(entries, mode, (rec) => rec.balance),
    [entries, mode],
  );
  const options = useMemo(() => trajectoryOptions(series), [series]);
  return (
    <ChartCard title="Balance over the retirement">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

export function SpendOverTimeChart({
  entries,
  mode,
}: {
  entries: CompareEntry[];
  mode: YearMode;
}) {
  const series = useMemo(
    () => trajectorySeries(entries, mode, (rec) => rec.withdrawal),
    [entries, mode],
  );
  const options = useMemo(() => trajectoryOptions(series), [series]);
  return (
    <ChartCard title="Spending over the retirement">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}
