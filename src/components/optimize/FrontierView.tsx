import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolatePlasma } from 'd3-scale-chromatic';

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
  const {
    study,
    studyDirty,
    results,
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

  return (
    <div className="frontier-view">
      <div className="frontier-header">
        <div>
          <strong>Strategy study</strong> — pin two of {`{`}holdings mix,
          withdrawal rate, withdrawal source{`}`} and sweep the third. Every
          variant runs against all historical start years; the Pareto-optimal
          set is highlighted on success rate, avg annual withdrawal, median
          final, and 95th-pct final. Uses the current horizon (
          {scenario.horizonYears}y), starting balance, and tail method.
        </div>
        <div className="frontier-actions">
          <button onClick={runSearch} disabled={running || !pool || !data}>
            {running
              ? 'Running…'
              : results.length
                ? 'Re-run study'
                : 'Run study'}
          </button>
          {!!results.length && (
            <>
              <button onClick={selectAll}>Select all</button>
              <button onClick={selectAllFrontier}>Select frontier</button>
              <button onClick={clearSelection}>Clear</button>
            </>
          )}
        </div>
      </div>
      <StudyConfigPanel />
      {!!results.length && (
        <div className="frontier-meta">
          {filteredResults.length}/{results.length} variants passing ·{' '}
          {frontier.length} on Pareto frontier · compute {computeMs.toFixed(0)} ms ·{' '}
          {selectedIds.length} selected
          {(studyDirty ||
            (lastConfig &&
              lastConfig.horizonYears !== scenario.horizonYears)) && (
            <span className="frontier-stale">
              {' '}
              · config changed — re-run to refresh
            </span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="frontier-controls">
            <label className="frontier-axis-pick">
              x:
              <select
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
            <label className="frontier-axis-pick">
              y:
              <select
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
            <label className="frontier-axis-pick">
              color:
              <select
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
            <label className="frontier-filter">
              min success ≥
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(minSuccessRate * 100)}
                onChange={(e) =>
                  setMinSuccessRate(parseInt(e.target.value, 10) / 100)
                }
              />
              <span className="frontier-filter-val">
                {(minSuccessRate * 100).toFixed(0)}%
              </span>
            </label>
          </div>
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
  const [hover, setHover] = useState<CandidateResult | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [marquee, setMarquee] = useState<{
    x0: number; y0: number; x1: number; y1: number;
  } | null>(null);
  const dragStateRef = useRef<{
    start: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const W = 720;
  const H = 360;
  const padL = 70;
  const padR = 16;
  const padT = 12;
  const padB = 40;

  const xVals = results.map((r) => r.metrics[xAxis]).filter(Number.isFinite);
  const yVals = results.map((r) => r.metrics[yAxis]).filter(Number.isFinite);
  if (xVals.length === 0 || yVals.length === 0) return null;

  const xMinRaw = Math.min(...xVals);
  const xMaxRaw = Math.max(...xVals);
  const yMinRaw = Math.min(...yVals);
  const yMaxRaw = Math.max(...yVals);
  const xMin = xAxis === 'successRate' ? Math.min(xMinRaw, 0) : Math.min(0, xMinRaw);
  const xMax = xMaxRaw;
  const yMin = yAxis === 'successRate' ? Math.min(yMinRaw, 0) : Math.min(0, yMinRaw);
  const yMax = yMaxRaw;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xScale = (v: number) =>
    padL + ((v - xMin) / xRange) * (W - padL - padR);
  const yScale = (v: number) =>
    H - padB - ((v - yMin) / yRange) * (H - padT - padB);

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

  const xTicks = 5;
  const yTicks = 4;

  // Color-by metric range (over the visible/passing set).
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

  // Mouse → SVG coords via getCTM.
  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    return { x, y };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const p = svgPoint(e.clientX, e.clientY);
    dragStateRef.current = { start: p, moved: false };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const p = svgPoint(e.clientX, e.clientY);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    setMarquee({
      x0: Math.min(drag.start.x, p.x),
      y0: Math.min(drag.start.y, p.y),
      x1: Math.max(drag.start.x, p.x),
      y1: Math.max(drag.start.y, p.y),
    });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return;
    if (drag.moved && marquee) {
      const inside: string[] = [];
      for (const r of results) {
        const x = xScale(r.metrics[xAxis]);
        const y = yScale(r.metrics[yAxis]);
        if (
          x >= marquee.x0 &&
          x <= marquee.x1 &&
          y >= marquee.y0 &&
          y <= marquee.y1
        ) {
          inside.push(r.candidate.id);
        }
      }
      onMarquee(inside);
      setMarquee(null);
    } else {
      // Click on empty space (no point hit handler triggered) → clear selection
      const target = e.target as Element;
      if (target.tagName !== 'circle') onMarquee([]);
      setMarquee(null);
    }
  };

  const onMouseLeave = () => {
    dragStateRef.current = null;
    setMarquee(null);
  };

  return (
    <div className="frontier-scatter-wrap">
      <svg
        ref={svgRef}
        className="frontier-scatter"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const v = xMin + (xRange * i) / xTicks;
          const x = xScale(v);
          return (
            <g key={`xt${i}`}>
              <line x1={x} x2={x} y1={H - padB} y2={H - padB + 4} stroke="#bbb" />
              <text x={x} y={H - padB + 16} fontSize="10" textAnchor="middle" fill="#666">
                {fmtAxis(xAxis, v)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = yMin + (yRange * i) / yTicks;
          const y = yScale(v);
          return (
            <g key={`yt${i}`}>
              <line x1={padL - 4} x2={padL} y1={y} y2={y} stroke="#bbb" />
              <text x={padL - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#666">
                {fmtAxis(yAxis, v)}
              </text>
            </g>
          );
        })}
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
        >
          {AXIS_LABELS[xAxis]}
        </text>
        <text
          x={14}
          y={(padT + H - padB) / 2}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
          transform={`rotate(-90 14 ${(padT + H - padB) / 2})`}
        >
          {AXIS_LABELS[yAxis]}
        </text>

        {/* Points: single pass using the selected color metric. Selected
            points get a black stroke; selection ring is independent of
            color so it stays visible across the whole viridis range. */}
        {results.map((r) => {
          const x = xScale(r.metrics[xAxis]);
          const y = yScale(r.metrics[yAxis]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const isSel = selectedIds.has(r.candidate.id);
          const fill = colorFor(r);
          return (
            <circle
              key={r.candidate.id}
              cx={x}
              cy={y}
              r={isSel ? 6 : 4}
              fill={fill}
              fillOpacity={isSel ? 1 : 0.7}
              stroke={isSel ? '#000' : '#fff'}
              strokeWidth={isSel ? 2 : 0.5}
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(r.candidate.id);
              }}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {marquee && (
          <rect
            x={marquee.x0}
            y={marquee.y0}
            width={marquee.x1 - marquee.x0}
            height={marquee.y1 - marquee.y0}
            fill="#1f77b4"
            fillOpacity={0.12}
            stroke="#1f77b4"
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {hover && (
          <g pointerEvents="none">
            <rect
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10)}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 70)}
              width={230}
              height={66}
              fill="#fff"
              stroke="#999"
              rx={3}
            />
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 70) + 14}
              fontSize="11"
              fill="#222"
            >
              {hover.candidate.label}
            </text>
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 70) + 28}
              fontSize="10"
              fill="#555"
            >
              success {(hover.metrics.successRate * 100).toFixed(1)}% · avg wd{' '}
              {fmtMoney(hover.metrics.avgAnnualWithdrawal)}/y
            </text>
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 70) + 42}
              fontSize="10"
              fill="#555"
            >
              p50 {fmtMoney(hover.metrics.p50Final)} · p95{' '}
              {fmtMoney(hover.metrics.p95Final)}
            </text>
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 70) + 56}
              fontSize="10"
              fill="#555"
            >
              near-depletion years: {hover.metrics.avgYearsNearDepletion.toFixed(1)}
            </text>
          </g>
        )}
      </svg>
      <div className="frontier-legend">
        {colorBy === 'frontier' ? (
          <>
            <span><span className="dot dot-frontier" /> Pareto-optimal</span>
            <span><span className="dot dot-other" /> dominated</span>
          </>
        ) : (
          <ColorBar colorBy={colorBy} cMin={cMin} cMax={cMax} />
        )}
        <span><span className="dot dot-selected" /> selected</span>
        <span className="frontier-tip">
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
      <p className="frontier-empty">
        Drag a marquee or click points in the scatter plot — or use "Select
        frontier" — to populate the comparison.
      </p>
    );
  }
  const byId = new Map(results.map((r) => [r.candidate.id, r]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((r): r is CandidateResult => !!r);

  return (
    <div className="frontier-table-wrap">
      <table className="frontier-table">
        <thead>
          <tr>
            <th></th>
            <th>Strategy</th>
            <th>Withdrawal</th>
            <th>Allocation</th>
            <th>Source</th>
            <th>Success</th>
            <th>Avg wd/yr</th>
            <th>P5 final</th>
            <th>Median final</th>
            <th>P95 final</th>
            <th title={`# yrs/sim balance < ${NEAR_DEPLETION_FRACTION * 100}% of initial`}>
              Near-depl yrs
            </th>
            <th>Worst start</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {selected.map((r, i) => (
            <tr key={r.candidate.id}>
              <td>
                <span
                  className="series-swatch"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
              </td>
              <td>{r.candidate.label}</td>
              <td>{r.candidate.params.withdrawal}</td>
              <td>{r.candidate.params.allocation}</td>
              <td>{r.candidate.params.source ?? '—'}</td>
              <td>
                {Number.isFinite(r.metrics.successRate)
                  ? `${(r.metrics.successRate * 100).toFixed(1)}%`
                  : '—'}
              </td>
              <td>{fmtMoney(r.metrics.avgAnnualWithdrawal)}</td>
              <td>{fmtMoney(r.metrics.p5Final)}</td>
              <td>{fmtMoney(r.metrics.p50Final)}</td>
              <td>{fmtMoney(r.metrics.p95Final)}</td>
              <td>{r.metrics.avgYearsNearDepletion.toFixed(1)}</td>
              <td>{r.metrics.worstStartYear ?? '—'}</td>
              <td>
                <button
                  className="frontier-apply"
                  onClick={() => onApply(r)}
                  title="Load this strategy into the single-scenario view"
                >
                  Apply
                </button>
              </td>
              <td>
                <button
                  className="frontier-remove"
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

  const maxVal = Math.max(
    1,
    ...selected.flatMap((r) => [
      r.metrics.p5Final,
      r.metrics.p50Final,
      r.metrics.p95Final,
    ]),
  );

  const W = 720;
  const rowH = 22;
  const labelW = 240;
  const padR = 60;
  const H = rowH * selected.length + 20;
  const barAreaW = W - labelW - padR;

  return (
    <div className="frontier-bars-wrap">
      <div className="frontier-bars-title">
        Final-balance distribution (P5 / Median / P95) per selected strategy
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {selected.map((r, i) => {
          const y = i * rowH + 8;
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const p5x = (r.metrics.p5Final / maxVal) * barAreaW;
          const p50x = (r.metrics.p50Final / maxVal) * barAreaW;
          const p95x = (r.metrics.p95Final / maxVal) * barAreaW;
          return (
            <g key={r.candidate.id}>
              <text
                x={labelW - 8}
                y={y + rowH / 2 + 3}
                fontSize="11"
                textAnchor="end"
                fill="#333"
              >
                {truncate(r.candidate.label, 36)}
              </text>
              <line
                x1={labelW + p5x}
                x2={labelW + p95x}
                y1={y + rowH / 2}
                y2={y + rowH / 2}
                stroke={color}
                strokeWidth={2}
                opacity={0.5}
              />
              <circle cx={labelW + p5x} cy={y + rowH / 2} r={4} fill={color} opacity={0.55} />
              <circle cx={labelW + p95x} cy={y + rowH / 2} r={4} fill={color} opacity={0.55} />
              <rect
                x={labelW + p50x - 3}
                y={y + 4}
                width={6}
                height={rowH - 8}
                fill={color}
              />
              <text
                x={labelW + p95x + 6}
                y={y + rowH / 2 + 3}
                fontSize="10"
                fill="#666"
              >
                {fmtMoney(r.metrics.p50Final)}
              </text>
            </g>
          );
        })}
      </svg>
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
  return (
    <details className="frontier-list-wrap">
      <summary>Show all {frontier.length} frontier strategies</summary>
      <table className="frontier-table">
        <thead>
          <tr>
            <th></th>
            <th>Strategy</th>
            <th>Success</th>
            <th>Avg wd/yr</th>
            <th>P5 final</th>
            <th>Median final</th>
            <th>P95 final</th>
            <th>Near-depl yrs</th>
          </tr>
        </thead>
        <tbody>
          {frontier.map((r) => (
            <tr key={r.candidate.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.candidate.id)}
                  onChange={() => onToggle(r.candidate.id)}
                />
              </td>
              <td>{r.candidate.label}</td>
              <td>
                {Number.isFinite(r.metrics.successRate)
                  ? `${(r.metrics.successRate * 100).toFixed(1)}%`
                  : '—'}
              </td>
              <td>{fmtMoney(r.metrics.avgAnnualWithdrawal)}</td>
              <td>{fmtMoney(r.metrics.p5Final)}</td>
              <td>{fmtMoney(r.metrics.p50Final)}</td>
              <td>{fmtMoney(r.metrics.p95Final)}</td>
              <td>{r.metrics.avgYearsNearDepletion.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <span className="frontier-colorbar">
      <span className="frontier-colorbar-label">{COLOR_BY_LABELS[colorBy]}:</span>
      <span className="frontier-colorbar-min">{formatColorValue(colorBy, cMin)}</span>
      <svg width={W} height={H} className="frontier-colorbar-svg">
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
      <span className="frontier-colorbar-max">{formatColorValue(colorBy, cMax)}</span>
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
