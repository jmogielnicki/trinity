import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { SimulationResult } from '../../engine/types';

type Props = {
  sim: SimulationResult;
  initialBalance: number;
  onClose?: () => void;
};

function fmt$(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function SimDetailPanel({ sim, initialBalance, onClose }: Props) {
  const { trajectory, startYear, success, inProgress, depletedAt } = sim;
  const failed = !success && !inProgress;
  const status = failed
    ? `Failed at year ${depletedAt}`
    : inProgress
      ? 'In progress'
      : 'Survived';

  const summary = useMemo(() => {
    let peakBalance = 0;
    let peakYear = 0;
    let minBalance = Infinity;
    let minYear = 0;
    let totalWithdrawn = 0;
    for (const r of trajectory) {
      if (r.balance > peakBalance) { peakBalance = r.balance; peakYear = r.t; }
      if (r.balance < minBalance) { minBalance = r.balance; minYear = r.t; }
      totalWithdrawn += r.withdrawal;
    }
    const finalBalance = trajectory[trajectory.length - 1]?.balance ?? 0;
    return { peakBalance, peakYear, minBalance: minBalance === Infinity ? 0 : minBalance, minYear, totalWithdrawn, finalBalance };
  }, [trajectory]);

  // Chart geometry
  const margin = { top: 12, right: 16, bottom: 40, left: 70 };
  const chartW = 760;
  const barStripH = 36;
  const lineAreaH = 140;
  const innerH = lineAreaH + barStripH + 6;
  const chartH = innerH + margin.top + margin.bottom;
  const innerW = chartW - margin.left - margin.right;

  const xScale = scaleLinear()
    .domain([0, Math.max(1, trajectory.length - 1)])
    .range([0, innerW]);

  const maxBal = useMemo(
    () => trajectory.reduce((m, r) => Math.max(m, r.balance), 0) || 1,
    [trajectory],
  );
  const yScale = scaleLinear().domain([0, maxBal]).range([lineAreaH, 0]).nice();

  const maxWd = useMemo(
    () => trajectory.reduce((m, r) => Math.max(m, r.withdrawal), 0) || 1,
    [trajectory],
  );
  const yWdScale = scaleLinear().domain([0, maxWd]).range([0, barStripH - 6]);

  const lineGen = line<{ t: number; balance: number }>()
    .x((d) => xScale(d.t))
    .y((d) => yScale(d.balance));

  const points = trajectory.map((r) => ({ t: r.t, balance: r.balance }));
  const strokeColor = failed ? '#d33' : '#2563eb';

  const yTicks = yScale.ticks(4);
  const xTicks = xScale.ticks(Math.min(10, trajectory.length));
  const barW = Math.max(1.5, innerW / Math.max(1, trajectory.length) - 0.5);

  // Calendar year labels for x-axis: show every ~10 years
  const calStep = Math.ceil(trajectory.length / 8);
  const calTicks = trajectory
    .filter((r) => r.t % calStep === 0 || r.t === trajectory.length - 1)
    .map((r) => ({ t: r.t, label: String(r.calendarYear) }));

  return (
    <div className="sim-detail-panel">
      <div className="sim-detail-header">
        <div className="sim-detail-title">
          <span className="sim-detail-year">Start {startYear}</span>
          <span className={`sim-detail-status ${failed ? 'status-failed' : inProgress ? 'status-inprogress' : 'status-survived'}`}>
            {status}
          </span>
          <span className="sim-detail-summary-stats">
            {!failed && <span>Final: <strong>{fmt$(summary.finalBalance)}</strong></span>}
            <span>Peak: <strong>{fmt$(summary.peakBalance)}</strong> (yr {summary.peakYear})</span>
            <span>Total withdrawn: <strong>{fmt$(summary.totalWithdrawn)}</strong></span>
          </span>
        </div>
        {onClose && (
          <button className="sim-detail-close" onClick={onClose} title="Close detail">×</button>
        )}
      </div>

      <svg width={chartW} height={chartH} className="sim-detail-chart">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Gridlines + y-axis labels (balance) */}
          {yTicks.map((v) => (
            <g key={v} transform={`translate(0,${yScale(v)})`}>
              <line x1={0} x2={innerW} stroke="#eee" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill="#888">
                {fmt$(v)}
              </text>
            </g>
          ))}

          {/* Balance line */}
          <path
            d={lineGen(points) ?? ''}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
          />

          {/* Depletion marker */}
          {depletedAt != null && (
            <line
              x1={xScale(depletedAt)}
              x2={xScale(depletedAt)}
              y1={0}
              y2={lineAreaH}
              stroke="#d33"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Balance axis label */}
          <text
            transform={`translate(${-52},${lineAreaH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
          >
            balance (real $)
          </text>

          {/* Separator */}
          <line
            x1={0} x2={innerW}
            y1={lineAreaH + 4} y2={lineAreaH + 4}
            stroke="#e0e0e0"
          />

          {/* Withdrawal bars */}
          {trajectory.map((r) => {
            const bh = yWdScale(r.withdrawal);
            const by = lineAreaH + 6 + (barStripH - 6) - bh;
            return (
              <rect
                key={r.t}
                x={xScale(r.t) - barW / 2}
                y={by}
                width={barW}
                height={bh}
                fill="#f97316"
                fillOpacity={0.65}
              />
            );
          })}

          {/* Withdrawal axis label */}
          <text
            x={-8}
            y={lineAreaH + 6 + (barStripH - 6) / 2}
            dy="0.32em"
            textAnchor="end"
            fontSize={9}
            fill="#888"
          >
            wdwl
          </text>

          {/* X-axis: year-into-retirement ticks */}
          {xTicks.map((v) => (
            <g key={v} transform={`translate(${xScale(v)},${innerH})`}>
              <line y1={0} y2={4} stroke="#bbb" />
              <text y={14} textAnchor="middle" fontSize={9} fill="#888">
                y{Math.round(v)}
              </text>
            </g>
          ))}

          {/* X-axis: calendar year labels below */}
          {calTicks.map(({ t, label }) => (
            <text
              key={t}
              x={xScale(t)}
              y={innerH + 28}
              textAnchor="middle"
              fontSize={9}
              fill="#666"
            >
              {label}
            </text>
          ))}

          {/* Axis label */}
          <text
            x={innerW / 2}
            y={innerH + 40}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
          >
            years into retirement / calendar year
          </text>
        </g>
      </svg>

      {/* Year-by-year data table */}
      <div className="sim-detail-table-wrap">
        <table className="sim-detail-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Calendar</th>
              <th>Balance</th>
              <th>Withdrawal</th>
              <th>W/D (% initial)</th>
              <th>Return</th>
              <th>Stocks</th>
              <th>Bonds</th>
              <th>Cash</th>
            </tr>
          </thead>
          <tbody>
            {trajectory.map((r) => (
              <tr key={r.t} className={r.depleted ? 'row-depleted' : ''}>
                <td>{r.t}</td>
                <td>{r.calendarYear}</td>
                <td className="num">{fmt$(r.balance)}</td>
                <td className="num">{fmt$(r.withdrawal)}</td>
                <td className="num">{fmtPct(r.withdrawal / initialBalance)}</td>
                <td className={`num ${r.return != null ? (r.return < 0 ? 'neg' : 'pos') : ''}`}>
                  {r.return != null ? fmtPct(r.return) : '—'}
                </td>
                <td className="num">{fmtPct(r.weights.stock, 0)}</td>
                <td className="num">{fmtPct(r.weights.bond, 0)}</td>
                <td className="num">{fmtPct(r.weights.cash, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
