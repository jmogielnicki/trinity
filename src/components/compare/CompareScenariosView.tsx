import { useEffect, useMemo, useState, useRef } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import { useLibraryStore } from '../../store/libraryStore';
import { useResultsStore } from '../../store/resultsStore';
import {
  COMPARE_MAX,
  useCompareScenariosStore,
  type CompareEntry,
} from '../../store/compareScenariosStore';

const SERIES_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f',
];

type MetricKey =
  | 'successRate'
  | 'p5Final'
  | 'p50Final'
  | 'p95Final'
  | 'avgAnnualWithdrawal'
  | 'minBalance';

const METRIC_LABEL: Record<MetricKey, string> = {
  successRate: 'Success rate',
  p5Final: '5th-pct final balance',
  p50Final: 'Median final balance',
  p95Final: '95th-pct final balance',
  avgAnnualWithdrawal: 'Avg annual withdrawal',
  minBalance: 'Min balance reached',
};

export function CompareScenariosView() {
  const saved = useLibraryStore((s) => s.saved);
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const {
    selectedIds,
    entries,
    running,
    computeMs,
    toggle,
    setSelection,
    clear,
    run,
  } = useCompareScenariosStore();

  // First time in, pre-select a handful so the view isn't blank.
  useEffect(() => {
    if (selectedIds.length === 0 && saved.length > 0) {
      setSelection(saved.slice(0, Math.min(6, saved.length)).map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Re-run whenever the selection changes (debounced, like the single view).
  useEffect(() => {
    if (!pool || !data) return;
    const id = setTimeout(() => void run(saved, pool), 150);
    return () => clearTimeout(id);
  }, [pool, data, saved, selectedIds, run]);

  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    selectedIds.forEach((id, i) =>
      m.set(id, SERIES_COLORS[i % SERIES_COLORS.length]),
    );
    return m;
  }, [selectedIds]);

  if (saved.length === 0) {
    return (
      <div className="compare-view">
        <div className="compare-header">
          <strong>Compare scenarios</strong> — pit several saved scenarios
          against one another.
        </div>
        <p className="compare-empty">
          No saved scenarios yet. Build a scenario, then use “Scenario library”
          in the sidebar to save it. Save a few and they’ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="compare-view">
      <div className="compare-header">
        <strong>Compare scenarios</strong> — runs each picked scenario across
        all historical start years (using its own balance, horizon, and tail
        method) and lines them up side by side. Pick up to {COMPARE_MAX}.
      </div>

      <div className="compare-pick-wrap">
        <div className="compare-pick-head">
          <span>
            {selectedIds.length} of {saved.length} selected
          </span>
          <div className="compare-pick-head-actions">
            <button
              onClick={() =>
                setSelection(saved.slice(0, COMPARE_MAX).map((s) => s.id))
              }
            >
              Select first {Math.min(COMPARE_MAX, saved.length)}
            </button>
            <button onClick={clear}>Clear</button>
          </div>
        </div>
        <ul className="compare-pick-list">
          {saved.map((s) => {
            const checked = selectedIds.includes(s.id);
            const color = colorById.get(s.id);
            return (
              <li key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && selectedIds.length >= COMPARE_MAX}
                    onChange={() => toggle(s.id)}
                  />
                  <span
                    className="compare-pick-swatch"
                    style={{ background: checked && color ? color : '#ddd' }}
                  />
                  <span className="compare-pick-name">{s.name}</span>
                  <span className="compare-pick-desc">
                    {describeWithdrawal(s.state.withdrawal)} ·{' '}
                    {describeAllocation(s.state.allocation)} ·{' '}
                    {s.state.horizonYears}y
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {entries.length > 0 && (
        <div className="compare-meta">
          {entries.length} scenario{entries.length === 1 ? '' : 's'} compared ·
          compute {computeMs.toFixed(0)} ms{running ? ' · updating…' : ''}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="compare-empty">
          Select at least one scenario above to compare.
        </p>
      ) : (
        <>
          <ComparisonTable entries={entries} />
          <SharedLegend entries={entries} />
          <div className="compare-charts-row compare-charts-row-3">
            <TerminalBalanceChart entries={entries} />
            <AverageSpendChart entries={entries} />
            <ScatterPlot entries={entries} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared legend — one row of color swatches + names for all entries
// ---------------------------------------------------------------------------

function SharedLegend({ entries }: { entries: CompareEntry[] }) {
  return (
    <div className="compare-shared-legend">
      {entries.map((e, i) => (
        <span key={e.saved.id} className="compare-legend-item">
          <span
            className="compare-legend-swatch"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {e.saved.name}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

function ComparisonTable({ entries }: { entries: CompareEntry[] }) {
  // Find the leader on each "higher is better" metric so we can highlight it.
  const best = (pick: (e: CompareEntry) => number) => {
    let bv = -Infinity;
    for (const e of entries) {
      const v = pick(e);
      if (Number.isFinite(v) && v > bv) bv = v;
    }
    return bv;
  };
  const bestSuccess = best((e) => e.metrics.successRate);
  const bestP5 = best((e) => e.metrics.p5Final);
  const bestP50 = best((e) => e.metrics.p50Final);
  const bestP95 = best((e) => e.metrics.p95Final);
  const bestAvgWd = best((e) => e.metrics.avgAnnualWithdrawal);
  const bestMin = best((e) => e.metrics.minBalance);

  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th></th>
            <th>Scenario</th>
            <th>Withdrawal</th>
            <th>Allocation</th>
            <th className="num">Horizon</th>
            <th className="num">Start $</th>
            <th className="num">Success</th>
            <th className="num">P5 final</th>
            <th className="num">Median final</th>
            <th className="num">P95 final</th>
            <th className="num">Avg withdrawal</th>
            <th className="num">Min balance</th>
            <th className="num">Worst start</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const m = e.metrics;
            const lead = (v: number, b: number) =>
              Number.isFinite(v) && v === b ? 'num lead' : 'num';
            return (
              <tr key={e.saved.id}>
                <td>
                  <span
                    className="series-swatch"
                    style={{
                      background: SERIES_COLORS[i % SERIES_COLORS.length],
                    }}
                  />
                </td>
                <td>{e.saved.name}</td>
                <td>{describeWithdrawal(e.saved.state.withdrawal)}</td>
                <td>{describeAllocation(e.saved.state.allocation)}</td>
                <td className="num">{e.saved.state.horizonYears}y</td>
                <td className="num">{fmtMoney(e.saved.state.initialBalance)}</td>
                <td className={lead(m.successRate, bestSuccess)}>
                  {Number.isFinite(m.successRate)
                    ? `${(m.successRate * 100).toFixed(1)}%`
                    : '—'}
                </td>
                <td className={lead(m.p5Final, bestP5)}>
                  {fmtMoney(m.p5Final)}
                </td>
                <td className={lead(m.p50Final, bestP50)}>
                  {fmtMoney(m.p50Final)}
                </td>
                <td className={lead(m.p95Final, bestP95)}>
                  {fmtMoney(m.p95Final)}
                </td>
                <td className={lead(m.avgAnnualWithdrawal, bestAvgWd)}>
                  {fmtMoney(m.avgAnnualWithdrawal)}
                </td>
                <td
                  className={
                    bestMin > 0 ? lead(m.minBalance, bestMin) : 'num'
                  }
                >
                  {fmtMoney(m.minBalance)}
                </td>
                <td className="num">{m.worstStartYear ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Average annual spend by start year — one line per scenario
// ---------------------------------------------------------------------------

function AverageSpendChart({ entries }: { entries: CompareEntry[] }) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const seriesArr = useMemo(() => {
    return entries.map((e, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const completed = e.result.sims
        .filter((s) => !s.inProgress)
        .sort((a, b) => a.startYear - b.startYear);
      const inProgress = e.result.sims
        .filter((s) => s.inProgress)
        .sort((a, b) => a.startYear - b.startYear);

      const avgSpend = (s: typeof completed[number]) =>
        s.trajectory.length > 0
          ? s.trajectory.reduce((sum, y) => sum + y.withdrawal, 0) / s.trajectory.length
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
    }).flat();
  }, [entries]);

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'line',
        width: null as any,
        height: 360,
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
            const v = this.value as number;
            if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
            if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
            return `$${v}`;
          },
        },
      },
      tooltip: {
        shared: false,
        formatter() {
          const v = this.y ?? 0;
          const yr = this.x ?? 0;
          return `<b>${this.series.name}</b><br/>Start ${yr}: ${fmtMoney(v)} avg annual spend`;
        },
      },
      legend: { enabled: false },
      series: seriesArr,
    }),
    [seriesArr],
  );

  return (
    <div className="compare-chart-wrap compare-chart-third">
      <div className="compare-chart-title">
        <span>Avg annual spend by start year</span>
      </div>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal balance by start year — one line per scenario
// ---------------------------------------------------------------------------

function TerminalBalanceChart({ entries }: { entries: CompareEntry[] }) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const seriesArr = useMemo(() => {
    return entries.map((e, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const completed = e.result.sims
        .filter((s) => !s.inProgress)
        .sort((a, b) => a.startYear - b.startYear);
      const inProgress = e.result.sims
        .filter((s) => s.inProgress)
        .sort((a, b) => a.startYear - b.startYear);

      const completedData = completed.map((s) => [
        s.startYear,
        s.success ? (s.finalBalance ?? 0) : 0,
      ]);
      const inProgressData = inProgress.map((s) => [s.startYear, s.finalBalance ?? 0]);

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
    }).flat();
  }, [entries]);

  const options: Options = useMemo(
    () => ({
      chart: {
        type: 'line',
        width: null as any,
        height: 360,
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
            const v = this.value as number;
            if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
            if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
            return `$${v}`;
          },
        },
      },
      tooltip: {
        shared: false,
        formatter() {
          const v = this.y ?? 0;
          const yr = this.x ?? 0;
          return `<b>${this.series.name}</b><br/>Start ${yr}: ${fmtMoney(v)} terminal balance`;
        },
      },
      legend: { enabled: false },
      series: seriesArr,
    }),
    [seriesArr],
  );

  return (
    <div className="compare-chart-wrap compare-chart-third">
      <div className="compare-chart-title">
        <span>Terminal balance by start year</span>
      </div>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter plot — each scenario as a point on two selectable metric axes
// ---------------------------------------------------------------------------

function ScatterPlot({ entries }: { entries: CompareEntry[] }) {
  const [xAxis, setXAxis] = useState<MetricKey>('successRate');
  const [yAxis, setYAxis] = useState<MetricKey>('p50Final');
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const fmt = (k: MetricKey, v: number) =>
    k === 'successRate' ? `${(v * 100).toFixed(0)}%` : fmtMoney(v);

  const xVals = entries.map((e) => e.metrics[xAxis]).filter(Number.isFinite);
  const yVals = entries.map((e) => e.metrics[yAxis]).filter(Number.isFinite);

  const seriesData = useMemo(() =>
    entries
      .filter((e) => Number.isFinite(e.metrics[xAxis]) && Number.isFinite(e.metrics[yAxis]))
      .map((e, i) => ({
        x: e.metrics[xAxis],
        y: e.metrics[yAxis],
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        custom: { entry: e, index: i },
        dataLabels: {
          enabled: true,
          format: truncate(e.saved.name, 16),
          style: { fontSize: '10px', color: '#444', fontWeight: 'normal', textOutline: 'none' },
          x: 9,
          y: 3,
          align: 'left' as const,
        },
      })),
    [entries, xAxis, yAxis]);

  const options: Options = useMemo(() => {
    const xMin = xVals.length ? Math.min(0, Math.min(...xVals)) : 0;
    const yMin = yVals.length ? Math.min(0, Math.min(...yVals)) : 0;

    return {
      chart: {
        type: 'scatter',
        width: null as any,
        height: 360,
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
          allowPointSelect: false,
          marker: {
            radius: 5,
            symbol: 'circle',
            lineColor: '#fff',
            lineWidth: 1.5,
          },
          dataLabels: {
            enabled: true,
          },
          states: {
            hover: {
              marker: { radius: 7 },
            },
          },
        },
      },
      legend: { enabled: false },
      series: [
        {
          type: 'scatter',
          data: seriesData,
          turboThreshold: 0,
        } as any,
      ],
    };
  }, [xAxis, yAxis, xVals, yVals, seriesData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (xVals.length === 0 || yVals.length === 0) return null;

  return (
    <div className="compare-chart-wrap compare-chart-third">
      <div className="compare-chart-title">
        <span>Scenarios plotted on two metrics</span>
        <div className="frontier-axes">
          <label>
            x:
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value as MetricKey)}
            >
              {(Object.keys(METRIC_LABEL) as MetricKey[]).map((k) => (
                <option key={k} value={k}>
                  {METRIC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            y:
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value as MetricKey)}
            >
              {(Object.keys(METRIC_LABEL) as MetricKey[]).map((k) => (
                <option key={k} value={k}>
                  {METRIC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeWithdrawal(w: WithdrawalStrategy): string {
  switch (w.type) {
    case 'fixedPercent':
      return `${pct(w.rate)} fixed`;
    case 'fixedDollar':
      return `${fmtMoney(w.amount)}/yr`;
    case 'percentOfBalance':
      return `${pct(w.rate)} of balance`;
    case 'floorAndUpside':
      return `${pct(w.floor)} floor + upside`;
    case 'piecewise':
      return 'piecewise';
    case 'piecewiseLinear':
      return 'curve';
    case 'guardrails':
      return `guardrails ${pct(w.base)}`;
    case 'ruleBased':
      return `rule-based ${pct(w.base)}`;
    case 'capeWithdrawal':
      return `CAPE (a=${pct(w.a)}, b=${w.b})`;
    case 'ratchet':
      return `ratchet ${pct(w.baseRate)} +${pct(w.stepBoost)}/${pct(w.stepSize)}`;
    case 'endowment':
      return `endowment ${pct(w.rate)} / ${w.lookbackYears}yr avg`;
    case 'vanguardDynamic':
      return `Vanguard dynamic ${pct(w.rate)}`;
    case 'custom':
    case 'customSrc':
      return 'custom';
  }
}

function describeAllocation(a: AllocationStrategy): string {
  switch (a.type) {
    case 'static': {
      const w = a.weights;
      return `${Math.round(w.stock * 100)}/${Math.round(w.bond * 100)}/${Math.round(w.cash * 100)}`;
    }
    case 'glidepath':
      return `glide ${Math.round(a.start.stock * 100)}→${Math.round(a.end.stock * 100)}% stk`;
    case 'linearDrift':
      return 'linear drift';
    case 'ageInBonds':
      return `age-in-bonds (${a.currentAge})`;
    case 'risingEquity':
      return `rising ${Math.round(a.start.stock * 100)}→${Math.round(a.end.stock * 100)}% stk`;
    case 'ruleBased':
      return 'rule-based';
    case 'custom':
    case 'customSrc':
      return 'custom';
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
