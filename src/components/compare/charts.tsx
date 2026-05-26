import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { fmtMoney } from '../../engine/strategyDescriptions';
import { quantile } from '../../engine/stats';
import type { CompareEntry } from '../../store/compareScenariosStore';
import { colorAt, withAlpha } from './compareColors';

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
        margin: [10, 16, 36, 12],
      },
      xAxis: { categories, labels: { style: { fontSize: '11px' } } },
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

export function MedianBalanceChart({ entries }: { entries: CompareEntry[] }) {
  const series = useMemo(
    () =>
      entries.map((e, i) =>
        lineSeries(e, i, e.result.percentiles.map((b) => [b.t, b.values.p50])),
      ),
    [entries],
  );
  const options = useMemo(() => timeSeriesOptions(series), [series]);
  return (
    <ChartCard title="Median balance over time">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

/** Median withdrawal at each year into retirement, over completed observed sims. */
function medianSpendSeries(e: CompareEntry): [number, number][] {
  const horizon = e.saved.state.horizonYears;
  const sims = e.result.sims.filter((s) => !s.bootstrapped && !s.inProgress);
  const out: [number, number][] = [];
  for (let t = 0; t < horizon; t++) {
    const vals: number[] = [];
    for (const s of sims) {
      const rec = s.trajectory[t];
      if (rec) vals.push(rec.withdrawal);
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    out.push([t, quantile(vals, 0.5)]);
  }
  return out;
}

export function MedianSpendChart({ entries }: { entries: CompareEntry[] }) {
  const series = useMemo(
    () => entries.map((e, i) => lineSeries(e, i, medianSpendSeries(e))),
    [entries],
  );
  const options = useMemo(() => timeSeriesOptions(series), [series]);
  return (
    <ChartCard title="Median spending over time">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Final-balance outcome buckets — 100% stacked bar per scenario
// ---------------------------------------------------------------------------

const BUCKETS: { label: string; color: string; test: (r: number) => boolean }[] = [
  { label: 'Depleted', color: '#c0392b', test: (r) => r <= 0 },
  { label: '< 1×',     color: '#e2792f', test: (r) => r > 0 && r < 1 },
  { label: '1–2×',     color: '#e6b800', test: (r) => r >= 1 && r < 2 },
  { label: '2–3×',     color: '#9bbf3c', test: (r) => r >= 2 && r < 3 },
  { label: '3–4×',     color: '#4f9d3a', test: (r) => r >= 3 && r < 4 },
  { label: '≥ 4×',     color: '#1a7f37', test: (r) => r >= 4 },
];

function bucketCounts(e: CompareEntry): number[] {
  const init = e.saved.state.initialBalance;
  const counts = new Array(BUCKETS.length).fill(0);
  for (const s of e.result.sims) {
    if (s.bootstrapped || s.inProgress) continue;
    const fb = s.success
      ? s.finalBalance ?? s.trajectory[s.trajectory.length - 1]?.balance ?? 0
      : 0;
    const r = init > 0 ? fb / init : 0;
    const idx = BUCKETS.findIndex((b) => b.test(r));
    counts[idx >= 0 ? idx : 0] += 1;
  }
  return counts;
}

export function FinalBalanceBucketChart({ entries }: { entries: CompareEntry[] }) {
  const categories = entries.map((e) => truncate(e.saved.name, 28));
  const counts = entries.map(bucketCounts);

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'bar',
        width: null as any,
        height: Math.max(170, entries.length * 40 + 80),
        margin: [10, 16, 56, 12],
      },
      xAxis: { categories, labels: { style: { fontSize: '11px' } } },
      yAxis: {
        min: 0,
        max: 100,
        reversedStacks: false,
        title: { text: '' },
        labels: { format: '{value}%' },
      },
      tooltip: {
        formatter() {
          const ctx = this as any;
          const total = (ctx.point?.stackTotal as number) ?? 0;
          return `<b>${ctx.series.name}</b><br/>${ctx.key}: ${ctx.y} of ${total} start years (${(ctx.percentage ?? 0).toFixed(0)}%)`;
        },
      },
      plotOptions: {
        series: { stacking: 'percent', borderWidth: 0, groupPadding: 0.08 },
      },
      legend: { enabled: true, reversed: false, itemStyle: { fontSize: '11px' } },
      series: BUCKETS.map((b, bi) => ({
        type: 'bar',
        name: b.label,
        color: b.color,
        data: counts.map((c) => c[bi]),
      })) as any,
    }),
    [categories, counts, entries.length],
  );

  return (
    <ChartCard title="Where the final balance lands (share of historical start years, × starting balance)">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}
