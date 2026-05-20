import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { interpolatePlasma } from 'd3-scale-chromatic';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { Btn } from '../ui/Btn';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';

/**
 * Plasma clamped to its darker portion (skips the bright pale-yellow end so
 * high-value points stay visible against the white background).
 */
function colorScale(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  return interpolatePlasma(0.1 + clamped * 0.7);
}
import { useOptimizeStore } from '../../store/optimizeStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { NEAR_DEPLETION_FRACTION, type CandidateResult } from '../../engine/optimize';
import { varyLabel } from '../../engine/study';
import { StudyConfigPanel } from './StudyConfigPanel';
import { StudyHeatmaps } from './StudyHeatmaps';
import { StudyTrajectories } from './StudyTrajectories';
import { useLibraryStore } from '../../store/libraryStore';
import { useSweepStore } from '../../store/sweepStore';
import type { SerializedState } from '../../data/urlState';

type Axis =
  | 'successRate'
  | 'p5Final'
  | 'p50Final'
  | 'p95Final'
  | 'avgAnnualWithdrawal'
  | 'avgYearsNearDepletion'
  | 'minBalance';

const AXIS_LABELS: Record<Axis, string> = {
  successRate: 'Success rate',
  p5Final: '5th-pct final balance',
  p50Final: 'Median final balance',
  p95Final: '95th-pct final balance',
  avgAnnualWithdrawal: 'Avg annual withdrawal',
  avgYearsNearDepletion: 'Avg years near depletion',
  minBalance: 'Min balance reached',
};

const AXIS_OPTIONS: Axis[] = [
  'successRate',
  'p5Final',
  'p50Final',
  'p95Final',
  'avgAnnualWithdrawal',
  'avgYearsNearDepletion',
  'minBalance',
];

type ColorBy =
  | 'frontier'
  | 'varyValue'
  | 'stockPct'
  | 'withdrawalRate'
  | 'floor'
  | 'marginalSpend'
  | 'successRate'
  | 'avgYearsNearDepletion';

const COLOR_BY_LABELS: Record<ColorBy, string> = {
  frontier: 'Pareto frontier',
  varyValue: 'Swept parameter',
  stockPct: 'Stock %',
  withdrawalRate: 'Withdrawal rate (fixed)',
  floor: 'Floor % (floor+upside)',
  marginalSpend: 'Marginal spend ($k per $1M over)',
  successRate: 'Success rate',
  avgYearsNearDepletion: 'Years near depletion',
};

function colorValue(r: CandidateResult, c: ColorBy): number | undefined {
  switch (c) {
    case 'frontier':
      return undefined;
    case 'varyValue':
      return r.candidate.numericParams.varyValue;
    case 'stockPct':
      return r.candidate.numericParams.stockPct;
    case 'withdrawalRate':
      return r.candidate.numericParams.withdrawalRate;
    case 'floor':
      return r.candidate.numericParams.floor;
    case 'marginalSpend':
      return r.candidate.numericParams.marginalSpend;
    case 'successRate':
      return Number.isFinite(r.metrics.successRate) ? r.metrics.successRate : undefined;
    case 'avgYearsNearDepletion':
      return Number.isFinite(r.metrics.avgYearsNearDepletion)
        ? r.metrics.avgYearsNearDepletion
        : undefined;
  }
}

function formatColorValue(c: ColorBy, v: number): string {
  switch (c) {
    case 'stockPct':
    case 'withdrawalRate':
    case 'floor':
    case 'successRate':
      return `${(v * 100).toFixed(0)}%`;
    case 'marginalSpend':
      return `$${Math.round(v * 1000)}k`;
    case 'avgYearsNearDepletion':
      return v.toFixed(1);
    case 'varyValue':
      return v <= 1 && v > 0
        ? `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`
        : v.toFixed(2).replace(/\.?0+$/, '');
    case 'frontier':
      return '';
  }
}

const SERIES_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f',
];

type Props = {
  onApplied?: () => void;
};

export function FrontierView({ onApplied }: Props) {
  const scenario = useScenarioStore();
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const saveToLibrary = useLibraryStore((s) => s.save);
  const sweepAxes = useSweepStore((s) => s.axes);
  const {
    study,
    studyDirty,
    results,
    axes,
    frontier,
    selectedIds,
    minSuccessRate,
    running,
    computeMs,
    lastConfig,
    run,
    toggleSelected,
    setSelected,
    selectAllFrontier,
    selectAll,
    clearSelection,
    setMinSuccessRate,
  } = useOptimizeStore();

  const [xAxis, setXAxis] = useState<Axis>('successRate');
  const [yAxis, setYAxis] = useState<Axis>('avgAnnualWithdrawal');
  const [colorBy, setColorBy] = useState<ColorBy>('varyValue');
  const [viewMode, setViewMode] = useState<'scatter' | 'trajectories'>('scatter');

  const is2D = axes.length === 2;

  const runSearch = () => {
    if (!pool || !data) return;
    void run(
      {
        initialBalance: scenario.initialBalance,
        horizonYears: scenario.horizonYears,
        tailMethod: scenario.tailMethod,
      },
      pool,
    );
  };

  useEffect(() => {
    if (!pool || !data) return;
    if (results.length === 0 && !running) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, data]);

  // Filtered results — drives both the scatter (hides non-passers) and the
  // frontier set (the store already recomputes the front on filter change).
  const filteredResults = useMemo(
    () =>
      results.filter(
        (r) =>
          Number.isFinite(r.metrics.successRate) &&
          r.metrics.successRate >= minSuccessRate,
      ),
    [results, minSuccessRate],
  );
  const frontierIds = useMemo(
    () => new Set(frontier.map((r) => r.candidate.id)),
    [frontier],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const applyStrategy = (r: CandidateResult) => {
    scenario.setAllocation(r.candidate.allocation);
    scenario.setWithdrawal(r.candidate.withdrawal);
    if (r.candidate.withdrawalSource)
      scenario.setWithdrawalSource(r.candidate.withdrawalSource);
    onApplied?.();
  };

  const saveVariant = (r: CandidateResult) => {
    const name = window.prompt('Save this variant to your library as:', r.candidate.label);
    if (!name) return;
    const state: SerializedState = {
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: r.candidate.allocation,
      withdrawal: r.candidate.withdrawal,
      withdrawalSource: r.candidate.withdrawalSource,
      tailMethod: scenario.tailMethod,
      axes: sweepAxes,
    };
    saveToLibrary(name, state);
  };

  return (
    <div className="flex flex-col gap-3.5 text-base">
      <div className="flex justify-between items-start gap-4">
        <div className="text-text-secondary text-sm max-w-[720px] leading-[1.4]">
          <strong>Strategy study</strong> — pin some of {`{`}holdings mix,
          withdrawal strategy, withdrawal source{`}`} and sweep the rest. Sweep
          one dimension for a scatter / trajectory comparison; sweep two for a
          heatmap grid. Every variant runs against all historical start years.
          Uses the current horizon ({scenario.horizonYears}y), starting
          balance, and tail method.
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Btn size="md" onClick={runSearch} disabled={running || !pool || !data}>
            {running ? 'Running…' : results.length ? 'Re-run study' : 'Run study'}
          </Btn>
          {!!results.length && (
            <>
              <Btn size="md" onClick={selectAll}>Select all</Btn>
              <Btn size="md" onClick={selectAllFrontier}>Select frontier</Btn>
              <Btn size="md" onClick={clearSelection}>Clear</Btn>
            </>
          )}
        </div>
      </div>
      <StudyConfigPanel />
      {!!results.length && (
        <div className="text-xs text-text-faint">
          {filteredResults.length}/{results.length} variants passing ·{' '}
          {frontier.length} on Pareto frontier · compute {computeMs.toFixed(0)} ms ·{' '}
          {selectedIds.length} selected
          {(studyDirty ||
            (lastConfig &&
              lastConfig.horizonYears !== scenario.horizonYears)) && (
            <span className="text-stale">
              {' '}
              · config changed — re-run to refresh
            </span>
          )}
        </div>
      )}

      {results.length > 0 && is2D && (
        <StudyHeatmaps
          results={results}
          axes={axes}
          onApply={applyStrategy}
          onSave={saveVariant}
        />
      )}

      {results.length > 0 && !is2D && (
        <>
          <div className="flex flex-wrap gap-[18px] text-sm text-text-secondary items-center py-1">
            <div className="mr-1">
              <TabBar>
                <ToggleButton active={viewMode === 'scatter'} onClick={() => setViewMode('scatter')}>
                  scatter
                </ToggleButton>
                <ToggleButton active={viewMode === 'trajectories'} onClick={() => setViewMode('trajectories')}>
                  trajectories
                </ToggleButton>
              </TabBar>
            </div>
            {viewMode === 'scatter' && (
              <>
                <label className="flex gap-1.5 items-center">
                  x:
                  <select
                    className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
                    value={xAxis}
                    onChange={(e) => setXAxis(e.target.value as Axis)}
                  >
                    {AXIS_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {AXIS_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-1.5 items-center">
                  y:
                  <select
                    className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
                    value={yAxis}
                    onChange={(e) => setYAxis(e.target.value as Axis)}
                  >
                    {AXIS_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {AXIS_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-1.5 items-center">
                  color:
                  <select
                    className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value as ColorBy)}
                  >
                    {(Object.keys(COLOR_BY_LABELS) as ColorBy[]).map((c) => (
                      <option key={c} value={c}>
                        {c === 'varyValue'
                          ? `${varyLabel(study)} (swept)`
                          : COLOR_BY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex gap-1.5 items-center">
                  min success ≥
                  <input
                    type="range"
                    className="w-[140px]"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(minSuccessRate * 100)}
                    onChange={(e) =>
                      setMinSuccessRate(parseInt(e.target.value, 10) / 100)
                    }
                  />
                  <span className="tabular-nums min-w-[32px] text-text-body">
                    {(minSuccessRate * 100).toFixed(0)}%
                  </span>
                </label>
              </>
            )}
          </div>
          {viewMode === 'scatter' ? (
            <>
              <ScatterPlot
                results={filteredResults}
                frontierIds={frontierIds}
                selectedIds={selectedSet}
                onToggle={toggleSelected}
                onMarquee={setSelected}
                xAxis={xAxis}
                yAxis={yAxis}
                colorBy={colorBy}
              />
              <ComparisonTable
                results={results}
                selectedIds={selectedIds}
                onRemove={toggleSelected}
                onApply={applyStrategy}
              />
              <ComparisonBars results={results} selectedIds={selectedIds} />
              <FrontierList
                frontier={frontier}
                selectedIds={selectedSet}
                onToggle={toggleSelected}
              />
            </>
          ) : (
            <StudyTrajectories results={results} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter plot with marquee selection
// ---------------------------------------------------------------------------

function ScatterPlot({
  results,
  frontierIds,
  selectedIds,
  onToggle,
  onMarquee,
  xAxis,
  yAxis,
  colorBy,
}: {
  results: CandidateResult[];
  frontierIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onMarquee: (ids: string[]) => void;
  xAxis: Axis;
  yAxis: Axis;
  colorBy: ColorBy;
}) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  // Stable refs so event handlers always see the latest data/callbacks.
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onMarqueeRef = useRef(onMarquee);
  onMarqueeRef.current = onMarquee;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const frontierIdsRef = useRef(frontierIds);
  frontierIdsRef.current = frontierIds;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const xAxisRef = useRef(xAxis);
  xAxisRef.current = xAxis;
  const yAxisRef = useRef(yAxis);
  yAxisRef.current = yAxis;
  const colorByRef = useRef(colorBy);
  colorByRef.current = colorBy;

  const fmtAxis = (a: Axis, v: number) => {
    switch (a) {
      case 'successRate':
        return `${(v * 100).toFixed(0)}%`;
      case 'avgYearsNearDepletion':
        return v.toFixed(1);
      default:
        return fmtMoney(v);
    }
  };

  // Compute color-related values based on results and colorBy
  const { cMin, cMax, colorFor } = useMemo(() => {
    const colorVals =
      colorBy === 'frontier'
        ? []
        : results
            .map((r) => colorValue(r, colorBy))
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const cMin = colorVals.length ? Math.min(...colorVals) : 0;
    const cMax = colorVals.length ? Math.max(...colorVals) : 1;
    const cRange = cMax - cMin || 1;

    const colorFor = (r: CandidateResult): string => {
      if (colorBy === 'frontier') {
        return frontierIds.has(r.candidate.id) ? '#d62728' : '#888';
      }
      const v = colorValue(r, colorBy);
      if (typeof v !== 'number' || !Number.isFinite(v)) return '#ccc';
      return colorScale((v - cMin) / cRange);
    };

    return { cMin, cMax, colorFor };
  }, [results, colorBy, frontierIds]);

  // Stable selection event handler.
  const selectionHandler = useCallback(function (this: unknown, e: any) {
    e.preventDefault();
    const cb = onMarqueeRef.current;
    if (!cb || !e.xAxis || !e.yAxis) return false;

    const xMin = e.xAxis[0].min as number;
    const xMax = e.xAxis[0].max as number;
    const yMin = e.yAxis[0].min as number;
    const yMax = e.yAxis[0].max as number;

    const currentXAxis = xAxisRef.current;
    const currentYAxis = yAxisRef.current;
    const ids: string[] = [];
    for (const r of resultsRef.current) {
      const vx = r.metrics[currentXAxis];
      const vy = r.metrics[currentYAxis];
      if (Number.isFinite(vx) && Number.isFinite(vy) &&
          vx >= xMin && vx <= xMax && vy >= yMin && vy <= yMax) {
        ids.push(r.candidate.id);
      }
    }
    cb(ids);
    return false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clickHandler = useCallback(function (this: unknown, _e: any) {
    onMarqueeRef.current?.([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pointClickHandler = useCallback(function (this: any) {
    const id = this.options?.custom?.id as string | undefined;
    if (id) onToggleRef.current?.(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const xVals = results.map((r) => r.metrics[xAxis]).filter(Number.isFinite);
  const yVals = results.map((r) => r.metrics[yAxis]).filter(Number.isFinite);

  const seriesData = useMemo(() => {
    return results
      .filter((r) => Number.isFinite(r.metrics[xAxis]) && Number.isFinite(r.metrics[yAxis]))
      .map((r) => ({
        x: r.metrics[xAxis],
        y: r.metrics[yAxis],
        color: colorFor(r),
        custom: { id: r.candidate.id, result: r },
      }));
  }, [results, xAxis, yAxis, colorFor, selectedIds]);

  const options: Options = useMemo(() => ({
    chart: {
      type: 'scatter',
      width: null as any,
      height: 360,
      margin: [16, 20, 48, 80],
      zooming: { type: 'xy' } as any,
      events: {
        click: clickHandler,
        selection: selectionHandler,
      },
    },
    xAxis: {
      title: { text: AXIS_LABELS[xAxis] },
      labels: { formatter() { return fmtAxis(xAxis, this.value as number); } },
    },
    yAxis: {
      title: { text: AXIS_LABELS[yAxis] },
      labels: { formatter() { return fmtAxis(yAxis, this.value as number); } },
    },
    tooltip: {
      snap: 20,
      formatter() {
        const ctx = this as any;
        const r = ctx.point?.options?.custom?.result as CandidateResult | undefined;
        if (!r) return false;
        const m = r.metrics;
        return `<span style="font-size:11px">
          <b>${r.candidate.label}</b><br/>
          success ${(m.successRate * 100).toFixed(1)}% · avg wd ${fmtMoney(m.avgAnnualWithdrawal)}/y<br/>
          p50 ${fmtMoney(m.p50Final)} · p95 ${fmtMoney(m.p95Final)}<br/>
          near-depletion years: ${m.avgYearsNearDepletion.toFixed(1)}
        </span>`;
      },
    },
    plotOptions: {
      scatter: {
        allowPointSelect: false,
        stickyTracking: false,
        cursor: 'pointer',
        point: { events: { click: pointClickHandler } },
        marker: { symbol: 'circle', radius: 5 },
      },
    },
    series: [{ type: 'scatter', data: seriesData, turboThreshold: 0 } as any],
  }), [xAxis, yAxis, seriesData, clickHandler, selectionHandler, pointClickHandler]); // eslint-disable-line react-hooks/exhaustive-deps

  if (xVals.length === 0 || yVals.length === 0) return null;

  return (
    <div className="border border-border-light rounded p-2 bg-surface-page">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
      <div className="flex gap-4 text-xs text-text-secondary mt-1.5 px-1.5">
        {colorBy === 'frontier' ? (
          <>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: '#d62728' }} /> Pareto-optimal</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1 opacity-50" style={{ background: '#aaa' }} /> dominated</span>
          </>
        ) : (
          <ColorBar colorBy={colorBy} cMin={cMin} cMax={cMax} />
        )}
        <span className="text-text-faint ml-auto italic">
          drag = marquee select · click = toggle · click empty = clear
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison table — now with Apply button
// ---------------------------------------------------------------------------

function ComparisonTable({
  results,
  selectedIds,
  onRemove,
  onApply,
}: {
  results: CandidateResult[];
  selectedIds: string[];
  onRemove: (id: string) => void;
  onApply: (r: CandidateResult) => void;
}) {
  if (selectedIds.length === 0) {
    return (
      <p className="text-sm text-text-faint py-3 text-center border border-dashed border-text-disabled rounded">
        Drag a marquee or click points in the scatter plot — or use "Select
        frontier" — to populate the comparison.
      </p>
    );
  }
  const byId = new Map(results.map((r) => [r.candidate.id, r]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((r): r is CandidateResult => !!r);

  const thCls = 'px-2 py-1.5 text-left text-xs font-medium text-text-muted uppercase tracking-[0.04em] bg-surface-hover border-b border-border-light whitespace-nowrap';
  const tdCls = 'px-2 py-1.5 border-b border-border-light whitespace-nowrap';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={thCls}></th>
            <th className={thCls}>Strategy</th>
            <th className={thCls}>Withdrawal</th>
            <th className={thCls}>Allocation</th>
            <th className={thCls}>Source</th>
            <th className={thCls}>Success</th>
            <th className={thCls}>Avg wd/yr</th>
            <th className={thCls}>P5 final</th>
            <th className={thCls}>Median final</th>
            <th className={thCls}>P95 final</th>
            <th className={thCls} title={`# yrs/sim balance < ${NEAR_DEPLETION_FRACTION * 100}% of initial`}>
              Near-depl yrs
            </th>
            <th className={thCls}>Worst start</th>
            <th className={thCls}></th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {selected.map((r, i) => (
            <tr key={r.candidate.id}>
              <td className={tdCls}>
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
              </td>
              <td className={tdCls}>{r.candidate.label}</td>
              <td className={tdCls}>{r.candidate.params.withdrawal}</td>
              <td className={tdCls}>{r.candidate.params.allocation}</td>
              <td className={tdCls}>{r.candidate.params.source ?? '—'}</td>
              <td className={tdCls}>
                {Number.isFinite(r.metrics.successRate)
                  ? `${(r.metrics.successRate * 100).toFixed(1)}%`
                  : '—'}
              </td>
              <td className={tdCls}>{fmtMoney(r.metrics.avgAnnualWithdrawal)}</td>
              <td className={tdCls}>{fmtMoney(r.metrics.p5Final)}</td>
              <td className={tdCls}>{fmtMoney(r.metrics.p50Final)}</td>
              <td className={tdCls}>{fmtMoney(r.metrics.p95Final)}</td>
              <td className={tdCls}>{r.metrics.avgYearsNearDepletion.toFixed(1)}</td>
              <td className={tdCls}>{r.metrics.worstStartYear ?? '—'}</td>
              <td className={tdCls}>
                <button
                  className="text-xs px-2 py-[3px] border border-text-disabled bg-surface rounded-[3px] cursor-pointer text-chart-blue hover:bg-surface-code hover:border-chart-blue"
                  onClick={() => onApply(r)}
                  title="Load this strategy into the single-scenario view"
                >
                  Apply
                </button>
              </td>
              <td className={tdCls}>
                <button
                  className="bg-transparent border-none text-stale cursor-pointer text-base leading-none px-1 hover:text-error"
                  onClick={() => onRemove(r.candidate.id)}
                  title="Remove from comparison"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison bars (final-balance P5/Median/P95 whiskers)
// ---------------------------------------------------------------------------

function ComparisonBars({
  results,
  selectedIds,
}: {
  results: CandidateResult[];
  selectedIds: string[];
}) {
  if (selectedIds.length === 0) return null;
  const byId = new Map(results.map((r) => [r.candidate.id, r]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((r): r is CandidateResult => !!r);

  if (selected.length === 0) return null;

  const chartHeight = selected.length * 28 + 40;

  // Build three scatter series (p5, p50, p95) plus one line series per strategy
  // that connects the p5 and p95 endpoints. We use inverted chart for horizontal bars.
  const categories = selected.map((r) => truncate(r.candidate.label, 36));

  // One line series per strategy connecting p5–p95
  const connectorSeries = selected.map((r, i) => ({
    type: 'line' as const,
    name: truncate(r.candidate.label, 36),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    lineWidth: 2,
    opacity: 0.5,
    marker: { enabled: false },
    enableMouseTracking: false,
    showInLegend: false,
    data: [
      { x: i, y: r.metrics.p5Final },
      { x: i, y: r.metrics.p95Final },
    ] as any,
  }));

  // P5 dots
  const p5Series = {
    type: 'scatter' as const,
    name: 'P5',
    showInLegend: false,
    enableMouseTracking: false,
    data: selected.map((r, i) => ({
      x: i,
      y: r.metrics.p5Final,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      marker: { radius: 4, fillOpacity: 0.55 },
    })),
  };

  // P95 dots
  const p95Series = {
    type: 'scatter' as const,
    name: 'P95',
    showInLegend: false,
    enableMouseTracking: false,
    data: selected.map((r, i) => ({
      x: i,
      y: r.metrics.p95Final,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      marker: { radius: 4, fillOpacity: 0.55 },
    })),
  };

  // P50 as scatter with dataLabels showing the value
  const p50Series = {
    type: 'scatter' as const,
    name: 'Median',
    showInLegend: false,
    enableMouseTracking: false,
    data: selected.map((r, i) => ({
      x: i,
      y: r.metrics.p50Final,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      marker: { radius: 5, symbol: 'square' },
      dataLabels: {
        enabled: true,
        format: `${fmtMoney(r.metrics.p50Final)}`,
        style: { fontSize: '10px', color: '#666', fontWeight: 'normal' },
        x: 8,
      },
    })),
  };

  const options: Options = {
    chart: {
      type: 'scatter',
      inverted: true,
      width: null as any,
      height: chartHeight,
      margin: [8, 80, 8, 200],
    },
    xAxis: {
      categories,
      title: { text: '' },
      tickWidth: 0,
      lineWidth: 0,
    },
    yAxis: {
      min: 0,
      title: { text: '' },
      labels: {
        formatter() {
          const v = this.value as number;
          return `$${(v / 1e6).toFixed(1)}M`;
        },
      },
    },
    tooltip: {
      formatter() {
        const ctx = this as any;
        const r = selected[ctx.point?.x];
        if (!r) return false;
        const m = r.metrics;
        return `<b>${r.candidate.label}</b><br/>P5: ${fmtMoney(m.p5Final)} · Median: ${fmtMoney(m.p50Final)} · P95: ${fmtMoney(m.p95Final)}`;
      },
    },
    plotOptions: {
      scatter: {
        marker: { symbol: 'circle' },
        dataLabels: { enabled: false },
      },
    },
    series: [...connectorSeries, p5Series as any, p95Series as any, p50Series as any],
  };

  return (
    <div className="border border-border-light rounded p-2.5 bg-surface-page">
      <div className="text-xs text-text-secondary mb-1.5">
        Final-balance distribution (P5 / Median / P95) per selected strategy
      </div>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        immutable={false}
      />
    </div>
  );
}

function FrontierList({
  frontier,
  selectedIds,
  onToggle,
}: {
  frontier: CandidateResult[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (frontier.length === 0) return null;

  const thCls = 'px-2 py-1.5 text-left text-xs font-medium text-text-muted uppercase tracking-[0.04em] bg-surface-hover border-b border-border-light whitespace-nowrap';
  const tdCls = 'px-2 py-1.5 border-b border-border-light whitespace-nowrap';

  return (
    <details className="[&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:text-text-secondary [&_summary]:py-1 [&[open]_summary]:mb-1.5">
      <summary>Show all {frontier.length} frontier strategies</summary>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={thCls}></th>
              <th className={thCls}>Strategy</th>
              <th className={thCls}>Success</th>
              <th className={thCls}>Avg wd/yr</th>
              <th className={thCls}>P5 final</th>
              <th className={thCls}>Median final</th>
              <th className={thCls}>P95 final</th>
              <th className={thCls}>Near-depl yrs</th>
            </tr>
          </thead>
          <tbody>
            {frontier.map((r) => (
              <tr key={r.candidate.id}>
                <td className={tdCls}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.candidate.id)}
                    onChange={() => onToggle(r.candidate.id)}
                  />
                </td>
                <td className={tdCls}>{r.candidate.label}</td>
                <td className={tdCls}>
                  {Number.isFinite(r.metrics.successRate)
                    ? `${(r.metrics.successRate * 100).toFixed(1)}%`
                    : '—'}
                </td>
                <td className={tdCls}>{fmtMoney(r.metrics.avgAnnualWithdrawal)}</td>
                <td className={tdCls}>{fmtMoney(r.metrics.p5Final)}</td>
                <td className={tdCls}>{fmtMoney(r.metrics.p50Final)}</td>
                <td className={tdCls}>{fmtMoney(r.metrics.p95Final)}</td>
                <td className={tdCls}>{r.metrics.avgYearsNearDepletion.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ColorBar({
  colorBy,
  cMin,
  cMax,
}: {
  colorBy: ColorBy;
  cMin: number;
  cMax: number;
}) {
  const W = 120;
  const H = 10;
  const stops = 12;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
      <span className="text-text-secondary">{COLOR_BY_LABELS[colorBy]}:</span>
      <span className="tabular-nums">{formatColorValue(colorBy, cMin)}</span>
      <svg width={W} height={H} className="border border-text-disabled rounded-sm align-middle inline-block">
        {Array.from({ length: stops }, (_, i) => (
          <rect
            key={i}
            x={(i / stops) * W}
            y={0}
            width={W / stops + 0.5}
            height={H}
            fill={colorScale(i / (stops - 1))}
          />
        ))}
      </svg>
      <span className="tabular-nums">{formatColorValue(colorBy, cMax)}</span>
    </span>
  );
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
