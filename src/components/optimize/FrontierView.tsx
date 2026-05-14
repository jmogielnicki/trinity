import { useEffect, useMemo, useState } from 'react';
import { useOptimizeStore, OPTIMIZE_MAX_SELECTED } from '../../store/optimizeStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import type { CandidateResult } from '../../engine/optimize';

type XAxis = 'successRate' | 'p5Final';
type YAxis = 'p50Final' | 'p95Final';

const SERIES_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f',
];

export function FrontierView() {
  const scenario = useScenarioStore();
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const {
    results,
    frontier,
    selectedIds,
    running,
    computeMs,
    lastConfig,
    run,
    toggleSelected,
    selectAllFrontier,
    clearSelection,
  } = useOptimizeStore();

  const [xAxis, setXAxis] = useState<XAxis>('successRate');
  const [yAxis, setYAxis] = useState<YAxis>('p50Final');

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

  // Auto-run once when entering the view if we have nothing yet.
  useEffect(() => {
    if (!pool || !data) return;
    if (results.length === 0 && !running) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, data]);

  const frontierIds = useMemo(
    () => new Set(frontier.map((r) => r.candidate.id)),
    [frontier],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className="frontier-view">
      <div className="frontier-header">
        <div>
          <strong>Strategy frontier</strong> — searches{' '}
          {results.length || '…'} candidate strategies, highlights the Pareto-
          optimal set (best on at least one of: success rate, median final,
          95th-pct final). Uses current horizon ({scenario.horizonYears}y),
          starting balance, and tail method.
        </div>
        <div className="frontier-actions">
          <button onClick={runSearch} disabled={running || !pool || !data}>
            {running ? 'Searching…' : results.length ? 'Re-run search' : 'Run search'}
          </button>
          {!!frontier.length && (
            <>
              <button onClick={selectAllFrontier}>Select frontier</button>
              <button onClick={clearSelection}>Clear</button>
            </>
          )}
        </div>
      </div>
      {!!results.length && (
        <div className="frontier-meta">
          {results.length} candidates · {frontier.length} on Pareto frontier ·
          compute {computeMs.toFixed(0)} ms · select up to {OPTIMIZE_MAX_SELECTED} for
          comparison ({selectedIds.length} selected)
          {lastConfig && lastConfig.horizonYears !== scenario.horizonYears && (
            <span className="frontier-stale">
              {' '}
              · horizon changed since last search — re-run to refresh
            </span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="frontier-axes">
            <label>
              x:
              <select
                value={xAxis}
                onChange={(e) => setXAxis(e.target.value as XAxis)}
              >
                <option value="successRate">Success rate</option>
                <option value="p5Final">5th-pct final balance</option>
              </select>
            </label>
            <label>
              y:
              <select
                value={yAxis}
                onChange={(e) => setYAxis(e.target.value as YAxis)}
              >
                <option value="p50Final">Median final balance</option>
                <option value="p95Final">95th-pct final balance</option>
              </select>
            </label>
          </div>
          <ScatterPlot
            results={results}
            frontierIds={frontierIds}
            selectedIds={selectedSet}
            onToggle={toggleSelected}
            xAxis={xAxis}
            yAxis={yAxis}
          />
          <ComparisonTable
            results={results}
            selectedIds={selectedIds}
            onRemove={toggleSelected}
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
// Scatter plot
// ---------------------------------------------------------------------------

function ScatterPlot({
  results,
  frontierIds,
  selectedIds,
  onToggle,
  xAxis,
  yAxis,
}: {
  results: CandidateResult[];
  frontierIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  xAxis: XAxis;
  yAxis: YAxis;
}) {
  const [hover, setHover] = useState<CandidateResult | null>(null);
  const W = 720;
  const H = 360;
  const padL = 64;
  const padR = 16;
  const padT = 12;
  const padB = 40;

  const xVals = results.map((r) => r.metrics[xAxis]).filter(Number.isFinite);
  const yVals = results.map((r) => r.metrics[yAxis]).filter(Number.isFinite);
  if (xVals.length === 0 || yVals.length === 0) return null;

  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = 0;
  const yMax = Math.max(...yVals);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xScale = (v: number) =>
    padL + ((v - xMin) / xRange) * (W - padL - padR);
  const yScale = (v: number) =>
    H - padB - ((v - yMin) / yRange) * (H - padT - padB);

  const fmtX = (v: number) =>
    xAxis === 'successRate' ? `${(v * 100).toFixed(0)}%` : fmtMoney(v);
  const fmtY = (v: number) => fmtMoney(v);

  const xTicks = 5;
  const yTicks = 4;

  return (
    <div className="frontier-scatter-wrap">
      <svg
        className="frontier-scatter"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
      >
        {/* axes */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const v = xMin + (xRange * i) / xTicks;
          const x = xScale(v);
          return (
            <g key={`xt${i}`}>
              <line x1={x} x2={x} y1={H - padB} y2={H - padB + 4} stroke="#bbb" />
              <text x={x} y={H - padB + 16} fontSize="10" textAnchor="middle" fill="#666">
                {fmtX(v)}
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
                {fmtY(v)}
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
          {axisLabel(xAxis)}
        </text>
        <text
          x={14}
          y={(padT + H - padB) / 2}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
          transform={`rotate(-90 14 ${(padT + H - padB) / 2})`}
        >
          {axisLabel(yAxis)}
        </text>

        {/* points: non-frontier first */}
        {results.map((r) => {
          if (frontierIds.has(r.candidate.id)) return null;
          const x = xScale(r.metrics[xAxis]);
          const y = yScale(r.metrics[yAxis]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const isSel = selectedIds.has(r.candidate.id);
          return (
            <circle
              key={r.candidate.id}
              cx={x}
              cy={y}
              r={isSel ? 5 : 3}
              fill={isSel ? '#1f77b4' : '#aaa'}
              fillOpacity={isSel ? 1 : 0.35}
              stroke={isSel ? '#000' : 'none'}
              strokeWidth={isSel ? 1 : 0}
              style={{ cursor: 'pointer' }}
              onClick={() => onToggle(r.candidate.id)}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {/* frontier points on top */}
        {results.map((r) => {
          if (!frontierIds.has(r.candidate.id)) return null;
          const x = xScale(r.metrics[xAxis]);
          const y = yScale(r.metrics[yAxis]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const isSel = selectedIds.has(r.candidate.id);
          return (
            <circle
              key={r.candidate.id}
              cx={x}
              cy={y}
              r={isSel ? 7 : 5}
              fill="#d62728"
              fillOpacity={0.9}
              stroke={isSel ? '#000' : '#fff'}
              strokeWidth={isSel ? 2 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => onToggle(r.candidate.id)}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {hover && (
          <g pointerEvents="none">
            <rect
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10)}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 60)}
              width={230}
              height={56}
              fill="#fff"
              stroke="#999"
              rx={3}
            />
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 60) + 14}
              fontSize="11"
              fill="#222"
            >
              {hover.candidate.label}
            </text>
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 60) + 28}
              fontSize="10"
              fill="#555"
            >
              success {(hover.metrics.successRate * 100).toFixed(1)}% · p50{' '}
              {fmtMoney(hover.metrics.p50Final)}
            </text>
            <text
              x={Math.min(W - 240, xScale(hover.metrics[xAxis]) + 10) + 6}
              y={Math.max(0, yScale(hover.metrics[yAxis]) - 60) + 42}
              fontSize="10"
              fill="#555"
            >
              p5 {fmtMoney(hover.metrics.p5Final)} · p95{' '}
              {fmtMoney(hover.metrics.p95Final)}
            </text>
          </g>
        )}
      </svg>
      <div className="frontier-legend">
        <span><span className="dot dot-frontier" /> Pareto-optimal</span>
        <span><span className="dot dot-other" /> dominated</span>
        <span><span className="dot dot-selected" /> selected (click to toggle)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

function ComparisonTable({
  results,
  selectedIds,
  onRemove,
}: {
  results: CandidateResult[];
  selectedIds: string[];
  onRemove: (id: string) => void;
}) {
  if (selectedIds.length === 0) {
    return (
      <p className="frontier-empty">
        Click points in the scatter plot, or use "Select frontier", to populate
        the comparison.
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
            <th>Success</th>
            <th>P5 final</th>
            <th>Median final</th>
            <th>P95 final</th>
            <th>Worst start</th>
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
              <td>
                {Number.isFinite(r.metrics.successRate)
                  ? `${(r.metrics.successRate * 100).toFixed(1)}%`
                  : '—'}
              </td>
              <td>{fmtMoney(r.metrics.p5Final)}</td>
              <td>{fmtMoney(r.metrics.p50Final)}</td>
              <td>{fmtMoney(r.metrics.p95Final)}</td>
              <td>{r.metrics.worstStartYear ?? '—'}</td>
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
// Comparison bars (final-balance percentile profile per selected strategy)
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
  const rowH = 28;
  const labelW = 240;
  const padR = 60;
  const H = rowH * selected.length + 20;
  const barAreaW = W - labelW - padR;

  return (
    <div className="frontier-bars-wrap">
      <div className="frontier-bars-title">
        Final-balance distribution (P5 / Median / P95) per strategy
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
              {/* whisker from p5 to p95 */}
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
              {/* median marker */}
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

// ---------------------------------------------------------------------------
// Frontier list (clickable, all frontier points even if not in scatter focus)
// ---------------------------------------------------------------------------

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
            <th>P5 final</th>
            <th>Median final</th>
            <th>P95 final</th>
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
              <td>{fmtMoney(r.metrics.p5Final)}</td>
              <td>{fmtMoney(r.metrics.p50Final)}</td>
              <td>{fmtMoney(r.metrics.p95Final)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function axisLabel(a: XAxis | YAxis): string {
  switch (a) {
    case 'successRate':
      return 'Success rate';
    case 'p5Final':
      return '5th-pct final balance';
    case 'p50Final':
      return 'Median final balance';
    case 'p95Final':
      return '95th-pct final balance';
  }
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
