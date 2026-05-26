import { useMemo, useRef, useState } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { fmtMoney } from '../../engine/strategyDescriptions';
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

const STATIC_WD = new Set(['fixedPercent', 'fixedDollar']);

/** Avg-spend-by-start-year is only interesting when some strategy spends dynamically. */
export function hasDynamicSpend(entries: CompareEntry[]): boolean {
  return entries.some((e) => !STATIC_WD.has(e.saved.state.withdrawal.type));
}

function ChartCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border-light rounded p-2 bg-surface-page min-w-0">
      <div className="flex justify-between items-center gap-3 text-xs text-text-secondary mb-1.5">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success rate — horizontal bars, one per scenario
// ---------------------------------------------------------------------------

export function SuccessRateChart({ entries }: { entries: CompareEntry[] }) {
  const categories = entries.map((e) => truncate(e.saved.name, 24));
  const data = entries.map((e, i) => ({
    y: Number.isFinite(e.metrics.successRate)
      ? e.metrics.successRate * 100
      : null,
    color: colorAt(i),
  }));

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'bar',
        width: null as any,
        height: Math.max(140, entries.length * 34 + 56),
        margin: [10, 44, 28, 12],
      },
      xAxis: {
        categories,
        labels: { style: { fontSize: '11px' } },
      },
      yAxis: {
        min: 0,
        max: 100,
        title: { text: '' },
        labels: { format: '{value}%' },
      },
      tooltip: {
        formatter() {
          return `<b>${this.key}</b><br/>${(this.y ?? 0).toFixed(1)}% historical success`;
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 2,
          dataLabels: {
            enabled: true,
            formatter() {
              return this.y == null ? '—' : `${(this.y as number).toFixed(0)}%`;
            },
            style: { fontSize: '11px', fontWeight: 'normal', textOutline: 'none' },
          },
        },
      },
      legend: { enabled: false },
      series: [{ type: 'bar', data, colorByPoint: true } as any],
    }),
    [categories, data, entries.length],
  );

  return (
    <ChartCard title="Success rate">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Outcome distribution — p5 / p25 / median / p75 / p95 of final balance
// ---------------------------------------------------------------------------

export function OutcomeDistributionChart({ entries }: { entries: CompareEntry[] }) {
  const categories = entries.map((e) => truncate(e.saved.name, 24));
  const data = entries.map((e, i) => {
    const m = e.metrics;
    const color = colorAt(i);
    return {
      low: m.p5Final,
      q1: m.p25Final,
      median: m.p50Final,
      q3: m.p75Final,
      high: m.p95Final,
      color,
      fillColor: withAlpha(color, 0.22),
      medianColor: color,
    };
  });

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'boxplot',
        inverted: true,
        width: null as any,
        height: Math.max(150, entries.length * 38 + 56),
        margin: [10, 16, 36, 12],
      },
      xAxis: {
        categories,
        labels: { style: { fontSize: '11px' } },
      },
      yAxis: {
        min: 0,
        title: { text: 'final balance (real $)' },
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
        boxplot: {
          lineWidth: 1.5,
          medianWidth: 3,
          whiskerLength: '60%',
        },
      },
      legend: { enabled: false },
      series: [{ type: 'boxplot', data } as any],
    }),
    [categories, data, entries.length],
  );

  return (
    <ChartCard title="Final-balance distribution (p5–p95, median bar)">
      <HighchartsReact highcharts={Highcharts} options={options} immutable={false} />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Trajectory envelope — median balance over years into retirement
// ---------------------------------------------------------------------------

export function TrajectoryEnvelopeChart({ entries }: { entries: CompareEntry[] }) {
  const [showBand, setShowBand] = useState(true);
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const seriesArr = useMemo(() => {
    const out: any[] = [];
    entries.forEach((e, i) => {
      const color = colorAt(i);
      const bands = e.result.percentiles;
      if (showBand) {
        out.push({
          type: 'arearange',
          name: `${truncate(e.saved.name, 24)} (25–75)`,
          color,
          lineWidth: 0,
          fillOpacity: 0.14,
          data: bands.map((b) => [b.t, b.values.p25, b.values.p75]),
          enableMouseTracking: false,
          showInLegend: false,
          zIndex: 0,
        });
      }
      out.push({
        type: 'line',
        name: truncate(e.saved.name, 28),
        color,
        lineWidth: 1.75,
        marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
        data: bands.map((b) => [b.t, b.values.p50]),
        zIndex: 2,
      });
    });
    return out;
  }, [entries, showBand]);

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'line',
        width: null as any,
        height: 340,
        margin: [16, 16, 48, 80],
      },
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
          return `<b>${this.series.name}</b><br/>Year ${yr}: ${fmtMoney(this.y ?? 0)} median balance`;
        },
      },
      legend: { enabled: false },
      series: seriesArr,
    }),
    [seriesArr],
  );

  return (
    <ChartCard
      title="Median balance over time"
      right={
        <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary">
          <input
            type="checkbox"
            checked={showBand}
            onChange={(e) => setShowBand(e.target.checked)}
          />
          25–75 band
        </label>
      }
    >
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Avg annual spend by start year — one line per scenario (dynamic strategies)
// ---------------------------------------------------------------------------

export function SpendChart({ entries }: { entries: CompareEntry[] }) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const seriesArr = useMemo(() => {
    return entries
      .map((e, i) => {
        const color = colorAt(i);
        const completed = e.result.sims
          .filter((s) => !s.inProgress)
          .sort((a, b) => a.startYear - b.startYear);
        const inProgress = e.result.sims
          .filter((s) => s.inProgress)
          .sort((a, b) => a.startYear - b.startYear);

        const avgSpend = (s: (typeof completed)[number]) =>
          s.trajectory.length > 0
            ? s.trajectory.reduce((sum, y) => sum + y.withdrawal, 0) /
              s.trajectory.length
            : 0;

        const completedData = completed.map((s) => [s.startYear, avgSpend(s)]);
        const inProgressData = inProgress.map((s) => [s.startYear, avgSpend(s)]);

        const series: any[] = [
          {
            type: 'line',
            name: truncate(e.saved.name, 28),
            color,
            lineWidth: 1.5,
            marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
            data: completedData,
            zIndex: 2,
          },
        ];

        if (inProgressData.length > 0) {
          series.push({
            type: 'line',
            name: `${truncate(e.saved.name, 24)} (in-progress)`,
            color,
            lineWidth: 1.5,
            dashStyle: 'Dash',
            opacity: 0.45,
            marker: { enabled: false },
            showInLegend: false,
            linkedTo: ':previous',
            data:
              completedData.length > 0
                ? [completedData[completedData.length - 1], ...inProgressData]
                : inProgressData,
            zIndex: 1,
          });
        }

        return series;
      })
      .flat();
  }, [entries]);

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'line',
        width: null as any,
        height: 340,
        margin: [16, 16, 48, 80],
      },
      xAxis: {
        title: { text: 'retirement start year' },
        labels: { style: { fontSize: '10px' } },
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
          return `<b>${this.series.name}</b><br/>Start ${yr}: ${fmtMoney(this.y ?? 0)} avg annual spend`;
        },
      },
      legend: { enabled: false },
      series: seriesArr,
    }),
    [seriesArr],
  );

  return (
    <ChartCard title="Avg annual spend by start year">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Scatter — each scenario as a point on two selectable metric axes
// ---------------------------------------------------------------------------

type MetricKey =
  | 'successRate'
  | 'p5Final'
  | 'p25Final'
  | 'p50Final'
  | 'p75Final'
  | 'p95Final'
  | 'avgAnnualWithdrawal'
  | 'minBalance';

const METRIC_LABEL: Record<MetricKey, string> = {
  successRate: 'Success rate',
  p5Final: '5th-pct final balance',
  p25Final: '25th-pct final balance',
  p50Final: 'Median final balance',
  p75Final: '75th-pct final balance',
  p95Final: '95th-pct final balance',
  avgAnnualWithdrawal: 'Avg annual withdrawal',
  minBalance: 'Min balance reached',
};

export function ScatterPlot({ entries }: { entries: CompareEntry[] }) {
  const [xAxis, setXAxis] = useState<MetricKey>('successRate');
  const [yAxis, setYAxis] = useState<MetricKey>('p50Final');
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const fmt = (k: MetricKey, v: number) =>
    k === 'successRate' ? `${(v * 100).toFixed(0)}%` : fmtMoney(v);

  const xVals = entries.map((e) => e.metrics[xAxis]).filter(Number.isFinite);
  const yVals = entries.map((e) => e.metrics[yAxis]).filter(Number.isFinite);

  const seriesData = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            Number.isFinite(e.metrics[xAxis]) && Number.isFinite(e.metrics[yAxis]),
        )
        .map((e, i) => ({
          x: e.metrics[xAxis],
          y: e.metrics[yAxis],
          color: colorAt(i),
          custom: { entry: e },
          dataLabels: {
            enabled: true,
            format: truncate(e.saved.name, 16),
            style: {
              fontSize: '10px',
              color: '#444',
              fontWeight: 'normal',
              textOutline: 'none',
            },
            x: 9,
            y: 3,
            align: 'left' as const,
          },
        })),
    [entries, xAxis, yAxis],
  );

  const options: Options = useMemo(() => {
    const xMin = xVals.length ? Math.min(0, Math.min(...xVals)) : 0;
    const yMin = yVals.length ? Math.min(0, Math.min(...yVals)) : 0;

    return {
      chart: {
        type: 'scatter',
        width: null as any,
        height: 340,
        margin: [16, 100, 48, 80],
      },
      xAxis: {
        min: xMin,
        title: { text: METRIC_LABEL[xAxis] },
        labels: {
          formatter() {
            return fmt(xAxis, this.value as number);
          },
        },
      },
      yAxis: {
        min: yMin,
        title: { text: METRIC_LABEL[yAxis] },
        labels: {
          formatter() {
            return fmt(yAxis, this.value as number);
          },
        },
      },
      tooltip: {
        formatter() {
          const ctx = this as any;
          const e = ctx.point?.options?.custom?.entry as CompareEntry | undefined;
          if (!e) return false;
          const m = e.metrics;
          return `<span style="font-size:11px">
            <b>${truncate(e.saved.name, 32)}</b><br/>
            success ${Number.isFinite(m.successRate) ? `${(m.successRate * 100).toFixed(1)}%` : '—'} · median ${fmtMoney(m.p50Final)}<br/>
            p5 ${fmtMoney(m.p5Final)} · p95 ${fmtMoney(m.p95Final)}
          </span>`;
        },
      },
      plotOptions: {
        scatter: {
          marker: { radius: 5, symbol: 'circle', lineColor: '#fff', lineWidth: 1.5 },
          dataLabels: { enabled: true },
          states: { hover: { marker: { radius: 7 } } },
        },
      },
      legend: { enabled: false },
      series: [{ type: 'scatter', data: seriesData, turboThreshold: 0 } as any],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xAxis, yAxis, xVals, yVals, seriesData]);

  if (xVals.length === 0 || yVals.length === 0) return null;

  const axisSelect = (
    label: string,
    value: MetricKey,
    onChange: (k: MetricKey) => void,
  ) => (
    <label className="flex gap-1.5 items-center">
      {label}
      <select
        className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as MetricKey)}
      >
        {(Object.keys(METRIC_LABEL) as MetricKey[]).map((k) => (
          <option key={k} value={k}>
            {METRIC_LABEL[k]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <ChartCard
      title="Plot any two metrics"
      right={
        <div className="flex gap-4 text-sm text-text-secondary">
          {axisSelect('x:', xAxis, setXAxis)}
          {axisSelect('y:', yAxis, setYAxis)}
        </div>
      }
    >
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </ChartCard>
  );
}
