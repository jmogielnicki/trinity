import { useEffect, useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
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

type MetricKey = 'successRate' | 'p5Final' | 'p50Final' | 'p95Final';

const METRIC_LABEL: Record<MetricKey, string> = {
  successRate: 'Success rate',
  p5Final: '5th-pct final balance',
  p50Final: 'Median final balance',
  p95Final: '95th-pct final balance',
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
          <ScatterPlot entries={entries} />
          <TrajectoryChart entries={entries} />
          <DistributionBars entries={entries} />
        </>
      )}
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
// Scatter plot — each scenario as a point on two selectable metric axes
// ---------------------------------------------------------------------------

function ScatterPlot({ entries }: { entries: CompareEntry[] }) {
  const [xAxis, setXAxis] = useState<MetricKey>('successRate');
  const [yAxis, setYAxis] = useState<MetricKey>('p50Final');
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 360;
  const padL = 70;
  const padR = 90;
  const padT = 14;
  const padB = 40;

  const xVals = entries.map((e) => e.metrics[xAxis]).filter(Number.isFinite);
  const yVals = entries.map((e) => e.metrics[yAxis]).filter(Number.isFinite);
  if (xVals.length === 0 || yVals.length === 0) return null;

  const pad = (lo: number, hi: number) => {
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.08, hi + span * 0.08] as const;
  };
  const [xLo, xHi] = pad(Math.min(...xVals), Math.max(...xVals));
  const [yLo, yHi] = pad(Math.min(0, ...yVals), Math.max(...yVals));

  const x = scaleLinear().domain([xLo, xHi]).range([padL, W - padR]);
  const y = scaleLinear().domain([yLo, yHi]).range([H - padB, padT]);

  const fmt = (k: MetricKey, v: number) =>
    k === 'successRate' ? `${(v * 100).toFixed(0)}%` : fmtMoney(v);

  return (
    <div className="compare-chart-wrap">
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
      <svg
        className="frontier-scatter"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
      >
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {x.ticks(5).map((v) => (
          <g key={`xt${v}`}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={H - padB}
              y2={H - padB + 4}
              stroke="#bbb"
            />
            <text
              x={x(v)}
              y={H - padB + 16}
              fontSize="10"
              textAnchor="middle"
              fill="#666"
            >
              {fmt(xAxis, v)}
            </text>
          </g>
        ))}
        {y.ticks(4).map((v) => (
          <g key={`yt${v}`}>
            <line x1={padL - 4} x2={padL} y1={y(v)} y2={y(v)} stroke="#bbb" />
            <text
              x={padL - 6}
              y={y(v) + 3}
              fontSize="10"
              textAnchor="end"
              fill="#666"
            >
              {fmt(yAxis, v)}
            </text>
          </g>
        ))}
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
        >
          {METRIC_LABEL[xAxis]}
        </text>
        <text
          x={16}
          y={(padT + H - padB) / 2}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
          transform={`rotate(-90 16 ${(padT + H - padB) / 2})`}
        >
          {METRIC_LABEL[yAxis]}
        </text>

        {entries.map((e, i) => {
          const vx = e.metrics[xAxis];
          const vy = e.metrics[yAxis];
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const cx = x(vx);
          const cy = y(vy);
          const isHover = hover === i;
          return (
            <g key={e.saved.id}>
              <circle
                cx={cx}
                cy={cy}
                r={isHover ? 7 : 5}
                fill={color}
                fillOpacity={0.9}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={cx + 9}
                y={cy + 3}
                fontSize="10"
                fill="#444"
              >
                {truncate(e.saved.name, 16)}
              </text>
            </g>
          );
        })}

        {hover != null && entries[hover] && (
          <ScatterTip
            entry={entries[hover]}
            x={x(entries[hover].metrics[xAxis])}
            y={y(entries[hover].metrics[yAxis])}
            W={W}
          />
        )}
      </svg>
    </div>
  );
}

function ScatterTip({
  entry,
  x,
  y,
  W,
}: {
  entry: CompareEntry;
  x: number;
  y: number;
  W: number;
}) {
  const m = entry.metrics;
  const bx = Math.min(W - 220, x + 10);
  const by = Math.max(0, y - 58);
  return (
    <g pointerEvents="none">
      <rect x={bx} y={by} width={210} height={52} fill="#fff" stroke="#999" rx={3} />
      <text x={bx + 6} y={by + 14} fontSize="11" fill="#222">
        {truncate(entry.saved.name, 32)}
      </text>
      <text x={bx + 6} y={by + 28} fontSize="10" fill="#555">
        success{' '}
        {Number.isFinite(m.successRate)
          ? `${(m.successRate * 100).toFixed(1)}%`
          : '—'}{' '}
        · median {fmtMoney(m.p50Final)}
      </text>
      <text x={bx + 6} y={by + 42} fontSize="10" fill="#555">
        p5 {fmtMoney(m.p5Final)} · p95 {fmtMoney(m.p95Final)}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Trajectory chart — median balance over time, one line per scenario
// ---------------------------------------------------------------------------

function TrajectoryChart({ entries }: { entries: CompareEntry[] }) {
  const [showBand, setShowBand] = useState(false);
  const W = 720;
  const H = 360;
  const padL = 64;
  const padR = 16;
  const padT = 14;
  const padB = 40;

  const horizon = Math.max(
    1,
    ...entries.map((e) => e.result.percentiles.length),
  );

  let maxBal = 0;
  for (const e of entries) {
    for (const b of e.result.percentiles) {
      const v = showBand ? b.values.p95 : b.values.p50;
      if (v > maxBal) maxBal = v;
    }
  }
  maxBal = maxBal || 1;

  const x = scaleLinear().domain([0, Math.max(1, horizon - 1)]).range([padL, W - padR]);
  const y = scaleLinear().domain([0, maxBal]).range([H - padB, padT]).nice();

  const medianLine = line<{ t: number; v: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.v));
  const bandArea = area<{ t: number; lo: number; hi: number }>()
    .x((d) => x(d.t))
    .y0((d) => y(d.lo))
    .y1((d) => y(d.hi));

  return (
    <div className="compare-chart-wrap">
      <div className="compare-chart-title">
        <span>Median portfolio balance over retirement</span>
        <label>
          <input
            type="checkbox"
            checked={showBand}
            onChange={(e) => setShowBand(e.target.checked)}
          />
          show P5–P95 range
        </label>
      </div>
      <svg
        className="frontier-scatter"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
      >
        {y.ticks(5).map((v) => (
          <g key={`yt${v}`}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#eee" />
            <text x={padL - 8} y={y(v) + 3} fontSize="10" textAnchor="end" fill="#666">
              ${(v / 1e6).toFixed(1)}M
            </text>
          </g>
        ))}
        {x.ticks(Math.min(8, horizon)).map((v) => (
          <g key={`xt${v}`}>
            <line x1={x(v)} x2={x(v)} y1={H - padB} y2={H - padB + 4} stroke="#bbb" />
            <text x={x(v)} y={H - padB + 16} fontSize="10" textAnchor="middle" fill="#666">
              y{v}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />

        {showBand &&
          entries.map((e, i) => {
            const color = SERIES_COLORS[i % SERIES_COLORS.length];
            const pts = e.result.percentiles.map((b) => ({
              t: b.t,
              lo: b.values.p5,
              hi: b.values.p95,
            }));
            return (
              <path
                key={`band-${e.saved.id}`}
                d={bandArea(pts) ?? ''}
                fill={color}
                fillOpacity={0.07}
              />
            );
          })}
        {entries.map((e, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const pts = e.result.percentiles.map((b) => ({
            t: b.t,
            v: b.values.p50,
          }));
          return (
            <path
              key={`med-${e.saved.id}`}
              d={medianLine(pts) ?? ''}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeOpacity={0.9}
            />
          );
        })}
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
        >
          years into retirement
        </text>
      </svg>
      <SeriesLegend entries={entries} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution bars — final-balance P5 / median / P95 per scenario
// ---------------------------------------------------------------------------

function DistributionBars({ entries }: { entries: CompareEntry[] }) {
  const maxVal = Math.max(
    1,
    ...entries.flatMap((e) => [
      e.metrics.p5Final,
      e.metrics.p50Final,
      e.metrics.p95Final,
    ]).filter(Number.isFinite),
  );

  const W = 720;
  const rowH = 30;
  const labelW = 220;
  const padR = 70;
  const H = rowH * entries.length + 20;
  const barAreaW = W - labelW - padR;

  return (
    <div className="frontier-bars-wrap">
      <div className="frontier-bars-title">
        Final-balance distribution (P5 — Median — P95) per scenario
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {entries.map((e, i) => {
          const m = e.metrics;
          const y = i * rowH + 8;
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const sx = (v: number) =>
            labelW + (Number.isFinite(v) ? (v / maxVal) * barAreaW : 0);
          return (
            <g key={e.saved.id}>
              <text
                x={labelW - 8}
                y={y + rowH / 2 + 3}
                fontSize="11"
                textAnchor="end"
                fill="#333"
              >
                {truncate(e.saved.name, 30)}
              </text>
              <line
                x1={sx(m.p5Final)}
                x2={sx(m.p95Final)}
                y1={y + rowH / 2}
                y2={y + rowH / 2}
                stroke={color}
                strokeWidth={2}
                opacity={0.5}
              />
              <circle cx={sx(m.p5Final)} cy={y + rowH / 2} r={4} fill={color} opacity={0.55} />
              <circle cx={sx(m.p95Final)} cy={y + rowH / 2} r={4} fill={color} opacity={0.55} />
              <rect
                x={sx(m.p50Final) - 3}
                y={y + 5}
                width={6}
                height={rowH - 10}
                fill={color}
              />
              <text
                x={sx(m.p95Final) + 6}
                y={y + rowH / 2 + 3}
                fontSize="10"
                fill="#666"
              >
                {fmtMoney(m.p50Final)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SeriesLegend({ entries }: { entries: CompareEntry[] }) {
  return (
    <ul className="legend-row">
      {entries.map((e, i) => (
        <li key={e.saved.id}>
          <span
            className="sw"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {truncate(e.saved.name, 28)}
        </li>
      ))}
    </ul>
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
    case 'piecewise':
      return 'piecewise';
    case 'piecewiseLinear':
      return 'curve';
    case 'guardrails':
      return `guardrails ${pct(w.base)}`;
    case 'ruleBased':
      return `rule-based ${pct(w.base)}`;
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
