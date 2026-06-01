import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { interpolatePlasma } from 'd3-scale-chromatic';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import { Btn } from '../ui/Btn';
import { Button } from '../ui/Button';
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
import { useOptimizeStore, OVERLAY_MAX } from '../../store/optimizeStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { NEAR_DEPLETION_FRACTION, type CandidateResult } from '../../engine/optimize';
import { varyLabel } from '../../engine/study';
import { StudyConfigPanel } from './StudyConfigPanel';
import { StudyBasePicker } from './StudyBasePicker';
import { StudyTrajectories } from './StudyTrajectories';
import { AutoStudyPanel } from './AutoStudyPanel';
import { DEFAULT_WITHDRAWAL_SOURCE } from '../../engine/withdrawalSource';
import { SaveScenarioModal } from '../SaveScenarioModal';
import type { SerializedState } from '../../data/urlState';
import { colorAt, FRONTIER_HIGHLIGHT } from '../seriesColors';
import { CHART } from '../colors';
import {
  FinalBalanceDistributionChart,
  SpendDistributionChart,
  BalanceOverTimeChart,
  SpendOverTimeChart,
  truncate,
  type Series,
  type YearMode,
} from '../results/overlayCharts';
import { FIELD_BASE } from '../ui/fieldCls';

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
  | 'upsideRate'
  | 'successRate'
  | 'avgYearsNearDepletion';

const COLOR_BY_LABELS: Record<ColorBy, string> = {
  frontier: 'Pareto frontier',
  varyValue: 'Swept parameter',
  stockPct: 'Stock %',
  withdrawalRate: 'Withdrawal rate (fixed)',
  floor: 'Floor % (floor+upside)',
  upsideRate: 'Upside rate (% of current balance)',
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
    case 'upsideRate':
      return r.candidate.numericParams.upsideRate;
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
    case 'upsideRate':
      return `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
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

type Props = {
  onApplied?: () => void;
};

// ---------------------------------------------------------------------------
// Highlight / filter — a single predicate over the plotted field, driven by a
// text search, structured facets, and an optional "frontier of the current
// two axes" narrowing. Matching plans render at full strength; the rest dim to
// a faint wash so the field stays visible as context.
// ---------------------------------------------------------------------------

/** Which direction is "better" for each axis — used to build the visible frontier. */
const AXIS_HIGHER_BETTER: Record<Axis, boolean> = {
  successRate: true,
  p5Final: true,
  p50Final: true,
  p95Final: true,
  avgAnnualWithdrawal: true,
  avgYearsNearDepletion: false, // fewer near-depletion years is better
  minBalance: true,
};

/** Withdrawal family of a candidate, for the "type" facet. */
function withdrawalFamilyOf(r: CandidateResult): 'fixed' | 'ratchet' | 'curve' | 'other' {
  switch (r.candidate.withdrawal.type) {
    case 'fixedPercent':
      return 'fixed';
    case 'ratchet':
      return 'ratchet';
    case 'piecewiseLinear':
      return 'curve';
    default:
      return 'other';
  }
}

type Facets = {
  /** Allocation start-mix descriptor (e.g. "70/20/10"), or '' for any. */
  startMix: string;
  family: '' | 'fixed' | 'ratchet' | 'curve';
  /** Source descriptor (the human label), or '' for any. */
  source: string;
};

const EMPTY_FACETS: Facets = { startMix: '', family: '', source: '' };

/** The start-mix descriptor for a candidate (static weights or glide start). */
function startMixOf(r: CandidateResult): string {
  const a = r.candidate.allocation;
  if (a.type === 'static') {
    const w = a.weights;
    return `${Math.round(w.stock * 100)}/${Math.round(w.bond * 100)}/${Math.round(w.cash * 100)}`;
  }
  if (a.type === 'glidepath' || a.type === 'risingEquity') {
    const w = a.start;
    return `${Math.round(w.stock * 100)}/${Math.round(w.bond * 100)}/${Math.round(w.cash * 100)}`;
  }
  return '—';
}

/**
 * Pareto frontier over the two plotted axes: the points not dominated on both
 * x and y (respecting each axis's "higher is better" direction). This is the
 * upper-right edge the eye reads as "the top of the field," recomputed per
 * axis pair — distinct from the engine's global 4-objective frontier.
 */
function currentAxesFrontier(
  results: CandidateResult[],
  xAxis: Axis,
  yAxis: Axis,
): Set<string> {
  const xUp = AXIS_HIGHER_BETTER[xAxis];
  const yUp = AXIS_HIGHER_BETTER[yAxis];
  const pts = results
    .map((r) => ({
      id: r.candidate.id,
      x: r.metrics[xAxis],
      y: r.metrics[yAxis],
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const front = new Set<string>();
  for (const a of pts) {
    let dominated = false;
    for (const b of pts) {
      if (b.id === a.id) continue;
      const xGE = xUp ? b.x >= a.x : b.x <= a.x;
      const yGE = yUp ? b.y >= a.y : b.y <= a.y;
      const xGT = xUp ? b.x > a.x : b.x < a.x;
      const yGT = yUp ? b.y > a.y : b.y < a.y;
      if (xGE && yGE && (xGT || yGT)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.add(a.id);
  }
  return front;
}

export function FrontierView({ onApplied }: Props) {
  const scenario = useScenarioStore();
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const loadBase = useOptimizeStore((s) => s.loadBase);
  const {
    study,
    studyDirty,
    hasBase,
    autoMode,
    results,
    frontier,
    selectedIds,
    minSuccessRate,
    running,
    computeMs,
    lastConfig,
    run,
    runAuto,
    ensureResults,
    setAutoMode,
    toggleSelected,
    setSelected,
    selectAllFrontier,
    autoCurate,
    clearSelection,
    setMinSuccessRate,
  } = useOptimizeStore();

  const [xAxis, setXAxis] = useState<Axis>('successRate');
  const [yAxis, setYAxis] = useState<Axis>('avgAnnualWithdrawal');
  // Auto mode mixes all three dimensions, so the "swept parameter" colour is
  // meaningless — stock % is the most interpretable default there.
  const [colorBy, setColorBy] = useState<ColorBy>(autoMode ? 'stockPct' : 'varyValue');
  const [viewMode, setViewMode] = useState<'scatter' | 'trajectories'>('scatter');

  // Highlight / filter state: free-text search, structured facets, and a
  // toggle that narrows the highlight to the frontier of the two plotted axes.
  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [frontierOnly, setFrontierOnly] = useState(false);

  // Auto mode would render one SpaghettiChart per result (tens of thousands) —
  // force the scatter when it's on.
  const effectiveViewMode = autoMode ? 'scatter' : viewMode;

  const cfg = {
    initialBalance: scenario.initialBalance,
    horizonYears: scenario.horizonYears,
    tailMethod: scenario.tailMethod,
  };

  const runSearch = () => {
    if (!pool || !data) return;
    void run(cfg, pool);
  };

  const runAutoSearch = () => {
    if (!pool || !data) return;
    void runAuto(cfg, pool);
  };

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

  // Facet option lists — the distinct start mixes and sources present in the
  // current (success-filtered) field, so the dropdowns only offer real values.
  const facetOptions = useMemo(() => {
    const mixes = new Set<string>();
    const sources = new Set<string>();
    for (const r of filteredResults) {
      mixes.add(startMixOf(r));
      if (r.candidate.params.source) sources.add(r.candidate.params.source);
    }
    const numericMixSort = (a: string, b: string) => {
      const sa = parseInt(a, 10);
      const sb = parseInt(b, 10);
      return sb - sa || a.localeCompare(b);
    };
    return {
      startMixes: [...mixes].sort(numericMixSort),
      sources: [...sources].sort(),
    };
  }, [filteredResults]);

  // The highlight set: text search ∩ facets, optionally narrowed to the
  // current-axes frontier. Empty search + no facets + no frontier = "no filter
  // active," in which case everything is highlighted (nothing dims).
  const filterActive =
    search.trim() !== '' ||
    facets.startMix !== '' ||
    facets.family !== '' ||
    facets.source !== '' ||
    frontierOnly;

  const matchIds = useMemo(() => {
    if (!filterActive) return null; // null = no filter; everything full strength
    const q = search.trim().toLowerCase();
    let pool = filteredResults.filter((r) => {
      if (q && !r.candidate.label.toLowerCase().includes(q)) return false;
      if (facets.startMix && startMixOf(r) !== facets.startMix) return false;
      if (facets.family && withdrawalFamilyOf(r) !== facets.family) return false;
      if (facets.source && r.candidate.params.source !== facets.source) return false;
      return true;
    });
    if (frontierOnly) {
      const front = currentAxesFrontier(pool, xAxis, yAxis);
      pool = pool.filter((r) => front.has(r.candidate.id));
    }
    return new Set(pool.map((r) => r.candidate.id));
  }, [filterActive, search, facets, frontierOnly, filteredResults, xAxis, yAxis]);

  const matchCount = matchIds ? matchIds.size : filteredResults.length;

  const clearFilters = () => {
    setSearch('');
    setFacets(EMPTY_FACETS);
    setFrontierOnly(false);
  };

  // Push the current match set into the overlay (capped + evenly spaced).
  const overlayMatches = () => {
    if (!matchIds) return;
    setSelected([...matchIds]);
  };

  // Auto mode keeps metrics only; re-simulate full trajectories for the
  // currently-selected candidates so their overlay charts can render.
  useEffect(() => {
    if (!pool || !data || selectedIds.length === 0) return;
    void ensureResults(selectedIds, cfg, pool);
    // cfg is rebuilt each render but its fields are primitives; depend on them.
  }, [selectedIds, pool, data, cfg.initialBalance, cfg.horizonYears]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selected candidates as overlay-chart series, in selection order with
  // colors that match the comparison-table row swatches. Rows whose full
  // result hasn't been re-simulated yet are held back until it arrives.
  const selectedSeries = useMemo<Series[]>(() => {
    const byId = new Map(results.map((r) => [r.candidate.id, r]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((r): r is CandidateResult & { result: NonNullable<CandidateResult['result']> } =>
        !!r && !!r.result,
      )
      .map((r, i) => ({
        id: r.candidate.id,
        label: r.candidate.label,
        color: colorAt(i),
        metrics: r.metrics,
        result: r.result,
      }));
  }, [results, selectedIds]);

  const applyStrategy = (r: CandidateResult) => {
    scenario.setAllocation(r.candidate.allocation);
    scenario.setWithdrawal(r.candidate.withdrawal);
    if (r.candidate.withdrawalSource)
      scenario.setWithdrawalSource(r.candidate.withdrawalSource);
    onApplied?.();
  };

  // "Open in Build →" on the base picker — drops the pinned baseline into
  // the Build tab so the user can edit it, then come back and re-pick.
  const editBaseline = () => {
    scenario.setAllocation(study.lockedAllocation);
    scenario.setWithdrawal(study.lockedWithdrawal);
    scenario.setWithdrawalSource(study.lockedSource);
    onApplied?.();
  };

  // Save modal target — null when closed, the candidate being saved otherwise.
  const [saveTarget, setSaveTarget] = useState<CandidateResult | null>(null);
  const saveTargetState: SerializedState | null = saveTarget
    ? {
        initialBalance: scenario.initialBalance,
        horizonYears: scenario.horizonYears,
        allocation: saveTarget.candidate.allocation,
        withdrawal: saveTarget.candidate.withdrawal,
        withdrawalSource: saveTarget.candidate.withdrawalSource,
        tailMethod: scenario.tailMethod,
        // Optimize variants are concrete strategies, not Build-tab sweeps.
        axes: {
          withdrawalRate: { mode: 'pin' },
          stockPct: { mode: 'pin' },
          horizon: { mode: 'pin' },
        },
      }
    : null;

  return (
    <div className="flex flex-col gap-3.5 text-base">
      <div className="text-text-secondary text-sm max-w-[720px] leading-[1.4]">
        <strong>Plan study</strong> — start from a preset or saved
        plan, then sweep one of {`{`}holdings mix, withdrawal strategy,
        withdrawal source{`}`} to see how that dimension trades off against the
        rest. Every variant runs against all historical start years. Uses the
        current horizon ({scenario.horizonYears}y), starting balance, and tail
        method.
      </div>
      <div className="flex items-center gap-2">
        <TabBar>
          <ToggleButton active={!autoMode} onClick={() => setAutoMode(false)}>
            Manual
          </ToggleButton>
          <ToggleButton active={autoMode} onClick={() => setAutoMode(true)}>
            Auto
          </ToggleButton>
        </TabBar>
      </div>
      {autoMode ? (
        <AutoStudyPanel
          horizonYears={scenario.horizonYears}
          disabled={running || !pool || !data}
          running={running}
          hasResults={results.length > 0}
          onRun={runAutoSearch}
        />
      ) : (
        <>
          <StudyBasePicker onEditInBuild={editBaseline} />
          {hasBase && (
            <>
              <StudyConfigPanel />
              <RunStudyButton
                running={running}
                disabled={running || !pool || !data || study.varying.length === 0}
                hasResults={results.length > 0}
                sweptCount={study.varying.length}
                onClick={runSearch}
              />
            </>
          )}
        </>
      )}
      {!!results.length && (
        <div className="text-xs text-text-faint">
          {filteredResults.length}/{results.length} variants passing ·{' '}
          {frontier.length} on Pareto frontier · compute {computeMs.toFixed(0)} ms ·{' '}
          {selectedIds.length}/{OVERLAY_MAX} overlaid
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

      {results.length > 0 && (
        <>
          <OverlaySection
            series={selectedSeries}
            results={results}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onApply={applyStrategy}
            onSave={setSaveTarget}
            onAutoCurate={autoCurate}
            onSelectFrontier={selectAllFrontier}
            onClear={clearSelection}
            frontierCount={frontier.length}
            pickSource="scatter"
          />

          <div className="border-t border-border-light pt-3.5 mt-1 flex flex-col gap-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Explore all {results.length} variants
            </div>
          <div className="flex flex-wrap gap-[18px] text-sm text-text-secondary items-center py-1">
            {!autoMode && (
              <div className="mr-1">
                <TabBar>
                  <ToggleButton active={viewMode === 'scatter'} onClick={() => setViewMode('scatter')}>
                    Scatter
                  </ToggleButton>
                  <ToggleButton active={viewMode === 'trajectories'} onClick={() => setViewMode('trajectories')}>
                    Trajectories
                  </ToggleButton>
                </TabBar>
              </div>
            )}
            {effectiveViewMode === 'scatter' && (
              <>
                <label className="flex gap-1.5 items-center">
                  x:
                  <select
                    className="px-1.5 py-[3px] border border-text-disabled rounded-xs text-sm"
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
                    className="px-1.5 py-[3px] border border-text-disabled rounded-xs text-sm"
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
                    className="px-1.5 py-[3px] border border-text-disabled rounded-xs text-sm"
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
          {effectiveViewMode === 'scatter' && (
            <FilterBar
              search={search}
              onSearch={setSearch}
              facets={facets}
              onFacets={setFacets}
              startMixOptions={facetOptions.startMixes}
              sourceOptions={facetOptions.sources}
              frontierOnly={frontierOnly}
              onFrontierOnly={setFrontierOnly}
              frontierAxisLabels={[AXIS_LABELS[xAxis], AXIS_LABELS[yAxis]]}
              active={filterActive}
              matchCount={matchCount}
              totalCount={filteredResults.length}
              onClear={clearFilters}
              onOverlayMatches={overlayMatches}
            />
          )}
          {effectiveViewMode === 'scatter' ? (
            <>
              <ScatterPlot
                results={filteredResults}
                frontierIds={frontierIds}
                matchIds={matchIds}
                selectedIds={selectedSet}
                onToggle={toggleSelected}
                onMarquee={setSelected}
                xAxis={xAxis}
                yAxis={yAxis}
                colorBy={colorBy}
              />
              <FrontierList
                frontier={frontier}
                selectedIds={selectedSet}
                onToggle={toggleSelected}
              />
            </>
          ) : (
            <StudyTrajectories results={results} />
          )}
          </div>
        </>
      )}

      {saveTarget && saveTargetState && (
        <SaveScenarioModal
          onClose={() => setSaveTarget(null)}
          override={saveTargetState}
          defaultName={saveTarget.candidate.label}
          postSaveAction={{
            label: 'Use as new study base after saving',
            onAction: (saved, name) =>
              loadBase({
                allocation: saved.allocation,
                withdrawal: saved.withdrawal,
                source: saved.withdrawalSource ?? DEFAULT_WITHDRAWAL_SOURCE,
                label: name,
              }),
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Big bottom CTA that runs the study — the user's "go" button after they've
// picked a base and chosen what to sweep.
// ---------------------------------------------------------------------------

function RunStudyButton({
  running,
  disabled,
  hasResults,
  sweptCount,
  onClick,
}: {
  running: boolean;
  disabled: boolean;
  hasResults: boolean;
  sweptCount: number;
  onClick: () => void;
}) {
  const label = running
    ? 'Running…'
    : hasResults
      ? 'Re-run study'
      : 'Run study';
  const hint =
    sweptCount === 0
      ? 'Pick at least one dimension to sweep before running.'
      : `Runs every variant against all historical start years.`;
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <Button onClick={onClick} disabled={disabled} className="px-6 py-3">
        {label}
      </Button>
      <div className="text-xs text-text-muted">{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curated overlay — the primary compare-style surface (≤ OVERLAY_MAX variants)
// ---------------------------------------------------------------------------

function OverlaySection({
  series,
  results,
  selectedIds,
  onToggle,
  onApply,
  onSave,
  onAutoCurate,
  onSelectFrontier,
  onClear,
  frontierCount,
  pickSource,
}: {
  series: Series[];
  results: CandidateResult[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onApply: (r: CandidateResult) => void;
  onSave?: (r: CandidateResult) => void;
  /** When omitted (2D studies) the "Auto-pick" shortcut is hidden. */
  onAutoCurate?: () => void;
  onSelectFrontier: () => void;
  onClear: () => void;
  frontierCount: number;
  pickSource: 'scatter' | 'heatmap';
}) {
  const [yearMode, setYearMode] = useState<YearMode>('median');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-0.5 pr-3 border-r border-border-light flex-shrink-0">
          <span className="text-lg font-semibold text-text tabular-nums">{series.length}</span>
          <span className="text-sm text-text-muted tabular-nums">/{OVERLAY_MAX}</span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-text-muted ml-2 font-medium">
            overlaid
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {series.length === 0 ? (
            <span className="text-xs text-text-faint italic">
              Nothing overlaid —{' '}
              {onAutoCurate ? 'auto-pick a spread, take the frontier, or ' : 'take the frontier, or '}
              click {pickSource === 'heatmap' ? 'cells in the grid' : 'points in the scatter'} below.
            </span>
          ) : (
            series.map((s) => (
              <button
                key={s.id}
                onClick={() => onToggle(s.id)}
                className="inline-flex items-center gap-1.5 h-[26px] px-2 rounded-full border-[1.5px] text-xs font-medium cursor-pointer hover:-translate-y-px hover:shadow-sm transition-all"
                style={{ borderColor: s.color, backgroundColor: `${s.color}1a` }}
                title="Remove from overlay"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="leading-none whitespace-nowrap text-text">
                  {truncate(s.label, 28)}
                </span>
                <span className="tabular-nums text-text-muted">
                  {Number.isFinite(s.metrics.successRate)
                    ? `${(s.metrics.successRate * 100).toFixed(0)}%`
                    : '—'}
                </span>
                <svg className="opacity-55 ml-0.5" width="10" height="10" viewBox="0 0 10 10">
                  <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {onAutoCurate && <Btn size="sm" onClick={onAutoCurate}>Auto-pick {OVERLAY_MAX}</Btn>}
          {frontierCount > 0 && <Btn size="sm" onClick={onSelectFrontier}>Top frontier</Btn>}
          {series.length > 0 && <Btn size="sm" onClick={onClear}>Clear</Btn>}
        </div>
      </div>

      {series.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <FinalBalanceDistributionChart series={series} />
            <SpendDistributionChart series={series} />
          </div>

          <div className="flex items-center gap-2 text-sm text-text-secondary mt-1">
            <span>Play out each variant's</span>
            <select
              className={`${FIELD_BASE} px-2 py-[3px] text-text`}
              value={yearMode}
              onChange={(e) => setYearMode(e.target.value as YearMode)}
            >
              <option value="worst">worst</option>
              <option value="median">median</option>
              <option value="best">best</option>
            </select>
            <span>historical start year (by final balance).</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <BalanceOverTimeChart series={series} mode={yearMode} />
            <SpendOverTimeChart series={series} mode={yearMode} />
          </div>

          <details className="border border-border-light rounded bg-surface-page">
            <summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary select-none hover:bg-surface-hover">
              Show full metrics table
            </summary>
            <div className="px-2 pb-2">
              <ComparisonTable
                results={results}
                selectedIds={selectedIds}
                onRemove={onToggle}
                onApply={onApply}
                onSave={onSave}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter & highlight bar — drives the scatter's highlight set
// ---------------------------------------------------------------------------

function FilterBar({
  search,
  onSearch,
  facets,
  onFacets,
  startMixOptions,
  sourceOptions,
  frontierOnly,
  onFrontierOnly,
  frontierAxisLabels,
  active,
  matchCount,
  totalCount,
  onClear,
  onOverlayMatches,
}: {
  search: string;
  onSearch: (v: string) => void;
  facets: Facets;
  onFacets: (f: Facets) => void;
  startMixOptions: string[];
  sourceOptions: string[];
  frontierOnly: boolean;
  onFrontierOnly: (v: boolean) => void;
  frontierAxisLabels: [string, string];
  active: boolean;
  matchCount: number;
  totalCount: number;
  onClear: () => void;
  onOverlayMatches: () => void;
}) {
  const selCls = `${FIELD_BASE} px-2 py-[3px] text-sm text-text`;
  return (
    <div className="flex flex-col gap-2 border border-border-light rounded p-2.5 bg-surface-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Filter &amp; highlight
        </span>

        <label className="flex items-center gap-1.5">
          find
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="e.g. 70/20/10, ratchet, waterfall"
            className={`${FIELD_BASE} px-2 py-[3px] text-sm text-text w-[220px]`}
          />
        </label>

        <label className="flex items-center gap-1.5">
          start mix
          <select
            className={selCls}
            value={facets.startMix}
            onChange={(e) => onFacets({ ...facets, startMix: e.target.value })}
          >
            <option value="">any</option>
            {startMixOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          type
          <select
            className={selCls}
            value={facets.family}
            onChange={(e) =>
              onFacets({ ...facets, family: e.target.value as Facets['family'] })
            }
          >
            <option value="">any</option>
            <option value="fixed">fixed %</option>
            <option value="ratchet">ratchet</option>
            <option value="curve">curve</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          source
          <select
            className={selCls}
            value={facets.source}
            onChange={(e) => onFacets({ ...facets, source: e.target.value })}
          >
            <option value="">any</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <ToggleButton
          active={frontierOnly}
          onClick={() => onFrontierOnly(!frontierOnly)}
          title={`Highlight only the frontier of ${frontierAxisLabels[0]} vs ${frontierAxisLabels[1]}`}
        >
          Frontier only
        </ToggleButton>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted">
        {active ? (
          <>
            <span className="text-text-body tabular-nums">
              {matchCount.toLocaleString()} / {totalCount.toLocaleString()} highlighted
            </span>
            {matchCount > 0 && (
              <Btn size="sm" onClick={onOverlayMatches}>
                Overlay these ({Math.min(matchCount, OVERLAY_MAX)})
              </Btn>
            )}
            <Btn size="sm" onClick={onClear}>
              Clear filters
            </Btn>
          </>
        ) : (
          <span className="italic">
            Search a label, pick a start mix / type / source, or isolate the
            current-axes frontier to highlight a subset against the field.
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter plot with marquee selection
// ---------------------------------------------------------------------------

function ScatterPlot({
  results,
  frontierIds,
  matchIds,
  selectedIds,
  onToggle,
  onMarquee,
  xAxis,
  yAxis,
  colorBy,
}: {
  results: CandidateResult[];
  frontierIds: Set<string>;
  /** Highlight set; null = no filter active (everything full strength). */
  matchIds: Set<string> | null;
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
  const matchIdsRef = useRef(matchIds);
  matchIdsRef.current = matchIds;

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
        return frontierIds.has(r.candidate.id) ? FRONTIER_HIGHLIGHT : CHART.faint;
      }
      const v = colorValue(r, colorBy);
      if (typeof v !== 'number' || !Number.isFinite(v)) return CHART.grid;
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
    const matches = matchIdsRef.current;
    const ids: string[] = [];
    for (const r of resultsRef.current) {
      // When a filter is active, a marquee only grabs highlighted points —
      // the dimmed field is context, not a selection target.
      if (matches && !matches.has(r.candidate.id)) continue;
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
    const plotted = results.filter(
      (r) => Number.isFinite(r.metrics[xAxis]) && Number.isFinite(r.metrics[yAxis]),
    );
    const mapPoint = (r: CandidateResult, dim: boolean) => ({
      x: r.metrics[xAxis],
      y: r.metrics[yAxis],
      // Non-matches fade to a faint wash so the field stays as context; matches
      // keep their full computed colour and sit larger, drawn on top. The "33"
      // alpha suffix makes dimmed points translucent.
      color: dim ? `${CHART.grid}55` : colorFor(r),
      marker: dim ? { radius: 3 } : matchIds ? { radius: 6 } : undefined,
      custom: { id: r.candidate.id, result: r },
    });
    if (!matchIds) return plotted.map((r) => mapPoint(r, false));
    // Dimmed first, highlighted last → highlighted render on top.
    const dimmed = plotted.filter((r) => !matchIds.has(r.candidate.id));
    const lit = plotted.filter((r) => matchIds.has(r.candidate.id));
    return [
      ...dimmed.map((r) => mapPoint(r, true)),
      ...lit.map((r) => mapPoint(r, false)),
    ];
    // selectedIds intentionally omitted — not read here, and rebuilding ~50k
    // points on every selection click is needlessly expensive.
  }, [results, xAxis, yAxis, colorFor, matchIds]);

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
            <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: FRONTIER_HIGHLIGHT }} /> Pareto-optimal</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1 opacity-50" style={{ background: CHART.faint }} /> dominated</span>
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
  onSave,
}: {
  results: CandidateResult[];
  selectedIds: string[];
  onRemove: (id: string) => void;
  onApply: (r: CandidateResult) => void;
  onSave?: (r: CandidateResult) => void;
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
            <th className={thCls}>Plan</th>
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
            {onSave && <th className={thCls}></th>}
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {selected.map((r, i) => (
            <tr key={r.candidate.id}>
              <td className={tdCls}>
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: colorAt(i) }}
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
                  className="text-xs px-2 py-[3px] border border-text-disabled bg-surface rounded-xs cursor-pointer text-chart-blue hover:bg-surface-code hover:border-chart-blue"
                  onClick={() => onApply(r)}
                  title="Load this plan into the Build plan view"
                >
                  Apply
                </button>
              </td>
              {onSave && (
                <td className={tdCls}>
                  <button
                    className="text-xs px-2 py-[3px] border border-text-disabled bg-surface rounded-xs cursor-pointer text-text-secondary hover:bg-surface-code hover:border-border"
                    onClick={() => onSave(r)}
                    title="Save this variant to your library"
                  >
                    Save
                  </button>
                </td>
              )}
              <td className={tdCls}>
                <button
                  className="bg-transparent border-none text-stale cursor-pointer text-base leading-none px-1 hover:text-error"
                  onClick={() => onRemove(r.candidate.id)}
                  title="Remove from overlay"
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
      <summary>Show all {frontier.length} frontier plans</summary>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={thCls}></th>
              <th className={thCls}>Plan</th>
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
