import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { SimulationResult, Sleeves, YearStateRecord } from '../../engine/types';
import { SleeveChart } from './SleeveChart';

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

function fmtFlow(n: number): string {
  if (Math.abs(n) < 1) return '—';
  const abs = fmt$(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

function zeroSleeves(): Sleeves {
  return { stock: 0, bond: 0, cash: 0 };
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

  const hasRefill = useMemo(
    () => trajectory.some((r) => {
      const f = r.refillFlow;
      return f && (Math.abs(f.stock) > 1 || Math.abs(f.bond) > 1 || Math.abs(f.cash) > 1);
    }),
    [trajectory],
  );

  // Calendar year labels for x-axis: show every ~10 years
  const calStep = Math.ceil(trajectory.length / 8);
  const calTicks = trajectory
    .filter((r) => r.t % calStep === 0 || r.t === trajectory.length - 1)
    .map((r) => ({ t: r.t, label: String(r.calendarYear) }));

  const [detailMode, setDetailMode] = useState(false);
  const [chartView, setChartView] = useState<'balance' | 'sleeves'>('balance');

  // Hover state: index into trajectory
  const [hoveredT, setHoveredT] = useState<number | null>(null);
  const hoveredRecord: YearStateRecord | null =
    hoveredT != null ? (trajectory[hoveredT] ?? null) : null;

  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = Math.round(xScale.invert(px));
    const clamped = Math.max(0, Math.min(trajectory.length - 1, t));
    setHoveredT(clamped);
  };

  // Flip tooltip to left when in right half
  const tooltipFlip = hoveredT != null && xScale(hoveredT) > innerW / 2;

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

      <div className="sim-detail-chart-tabs">
        <button
          className={chartView === 'balance' ? 'active' : ''}
          onClick={() => setChartView('balance')}
        >
          balance &amp; withdrawals
        </button>
        <button
          className={chartView === 'sleeves' ? 'active' : ''}
          onClick={() => setChartView('sleeves')}
        >
          sleeve composition
        </button>
      </div>

      {chartView === 'sleeves' && (
        <SleeveChart sim={sim} width={chartW} height={chartH} />
      )}

      {chartView === 'balance' && (
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

          {/* Hover interaction overlay */}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredT(null)}
            style={{ cursor: 'crosshair' }}
          />

          {/* Crosshair + tooltip */}
          {hoveredRecord != null && hoveredT != null && (
            <g pointerEvents="none">
              {/* Vertical crosshair line */}
              <line
                x1={xScale(hoveredT)}
                x2={xScale(hoveredT)}
                y1={0}
                y2={innerH}
                stroke="#555"
                strokeWidth={1}
                strokeDasharray="3,2"
              />
              {/* Dot on balance line */}
              <circle
                cx={xScale(hoveredT)}
                cy={yScale(hoveredRecord.balance)}
                r={4}
                fill={strokeColor}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {/* Dot on withdrawal bar top */}
              <circle
                cx={xScale(hoveredT)}
                cy={lineAreaH + 6 + (barStripH - 6) - yWdScale(hoveredRecord.withdrawal)}
                r={3}
                fill="#f97316"
                stroke="#fff"
                strokeWidth={1.5}
              />
              {/* Tooltip box */}
              {(() => {
                const r = hoveredRecord;
                const tipLines = [
                  `Year ${r.t}  ·  ${r.calendarYear}`,
                  `Balance: ${fmt$(r.balance)}`,
                  `Withdrawal: ${fmt$(r.withdrawal)}  (${fmtPct(r.withdrawal / initialBalance)} of initial)`,
                  r.return != null
                    ? `Return: ${fmtPct(r.return)}  ${r.return >= 0 ? '▲' : '▼'}`
                    : null,
                  `Alloc: ${fmtPct(r.weights.stock, 0)} stocks · ${fmtPct(r.weights.bond, 0)} bonds · ${fmtPct(r.weights.cash, 0)} cash`,
                ].filter(Boolean) as string[];

                const tipW = 248;
                const tipLineH = 15;
                const tipPad = 8;
                const tipH = tipLines.length * tipLineH + tipPad * 2;
                const cx = xScale(hoveredT);
                const tx = tooltipFlip ? cx - tipW - 10 : cx + 10;
                const ty = Math.max(0, yScale(r.balance) - tipH / 2);

                return (
                  <g transform={`translate(${tx},${ty})`}>
                    <rect
                      x={0} y={0}
                      width={tipW} height={tipH}
                      fill="#fff"
                      stroke="#bbb"
                      strokeWidth={0.5}
                      rx={4}
                      filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))"
                    />
                    {tipLines.map((l, i) => (
                      <text
                        key={i}
                        x={tipPad}
                        y={tipPad + (i + 0.75) * tipLineH}
                        fontSize={11}
                        fill={i === 0 ? '#222' : '#444'}
                        fontWeight={i === 0 ? 600 : 400}
                      >
                        {l}
                      </text>
                    ))}
                  </g>
                );
              })()}
            </g>
          )}
        </g>
      </svg>
      )}

      {/* Year-by-year data table */}
      <div className="sim-detail-table-header">
        <span className="sim-detail-table-label">Year-by-year detail</span>
        <button
          className={`sim-detail-mode-btn ${detailMode ? 'active' : ''}`}
          onClick={() => setDetailMode((v) => !v)}
        >
          {detailMode ? 'Hide flows' : 'Show flows'}
        </button>
      </div>
      <div className="sim-detail-table-wrap">
        <table className="sim-detail-table">
          <thead>
            <tr>
              {/* Base columns */}
              <th rowSpan={2}>Yr</th>
              <th rowSpan={2}>Cal</th>
              <th rowSpan={2} className="num">Balance</th>
              <th rowSpan={2} className="num">W/D $</th>
              <th rowSpan={2} className="num">W/D %</th>
              <th rowSpan={2} className="num">Return</th>
              {/* Detail groups */}
              {detailMode && <th colSpan={3} className="group-header">Start balance</th>}
              {detailMode && <th colSpan={3} className="group-header">Withdrawn from</th>}
              {detailMode && <th colSpan={3} className="group-header">Rebalanced (Δ)</th>}
              {detailMode && hasRefill && <th colSpan={3} className="group-header">Bucket refill (Δ)</th>}
              {detailMode && <th colSpan={3} className="group-header">Return earned</th>}
              {/* End sleeves (always shown in detail mode, simplified in basic) */}
              <th colSpan={3} className="group-header">End balance</th>
            </tr>
            <tr>
              {detailMode && <><th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th></>}
              {detailMode && <><th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th></>}
              {detailMode && <><th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th></>}
              {detailMode && hasRefill && <><th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th></>}
              {detailMode && <><th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th></>}
              <th className="num sub">Stock</th><th className="num sub">Bond</th><th className="num sub">Cash</th>
            </tr>
          </thead>
          <tbody>
            {trajectory.map((r) => {
              const ss = r.sleevesStart ?? zeroSleeves();
              const wb = r.withdrawalBySleeve ?? zeroSleeves();
              const rb = r.rebalanceFlow ?? zeroSleeves();
              const ret = r.returnBySleeve ?? zeroSleeves();
              const rf = r.refillFlow ?? zeroSleeves();
              const sl = r.sleeves;
              return (
                <tr key={r.t} className={r.depleted ? 'row-depleted' : ''}>
                  <td>{r.t}</td>
                  <td>{r.calendarYear}</td>
                  <td className="num">{fmt$(r.balance)}</td>
                  <td className="num">{fmt$(r.withdrawal)}</td>
                  <td className="num">{fmtPct(r.withdrawal / initialBalance)}</td>
                  <td className={`num ${r.return != null ? (r.return < 0 ? 'neg' : 'pos') : ''}`}>
                    {r.return != null ? fmtPct(r.return) : '—'}
                  </td>
                  {detailMode && <><td className="num">{fmt$(ss.stock)}</td><td className="num">{fmt$(ss.bond)}</td><td className="num">{fmt$(ss.cash)}</td></>}
                  {detailMode && <><td className="num neg">{wb.stock > 1 ? fmt$(wb.stock) : '—'}</td><td className="num neg">{wb.bond > 1 ? fmt$(wb.bond) : '—'}</td><td className="num neg">{wb.cash > 1 ? fmt$(wb.cash) : '—'}</td></>}
                  {detailMode && <><td className={`num ${rb.stock > 1 ? 'pos' : rb.stock < -1 ? 'neg' : ''}`}>{fmtFlow(rb.stock)}</td><td className={`num ${rb.bond > 1 ? 'pos' : rb.bond < -1 ? 'neg' : ''}`}>{fmtFlow(rb.bond)}</td><td className={`num ${rb.cash > 1 ? 'pos' : rb.cash < -1 ? 'neg' : ''}`}>{fmtFlow(rb.cash)}</td></>}
                  {detailMode && hasRefill && <><td className={`num ${rf.stock > 1 ? 'pos' : rf.stock < -1 ? 'neg' : ''}`}>{fmtFlow(rf.stock)}</td><td className={`num ${rf.bond > 1 ? 'pos' : rf.bond < -1 ? 'neg' : ''}`}>{fmtFlow(rf.bond)}</td><td className={`num ${rf.cash > 1 ? 'pos' : rf.cash < -1 ? 'neg' : ''}`}>{fmtFlow(rf.cash)}</td></>}
                  {detailMode && <><td className={`num ${ret.stock >= 0 ? 'pos' : 'neg'}`}>{fmtFlow(ret.stock)}</td><td className={`num ${ret.bond >= 0 ? 'pos' : 'neg'}`}>{fmtFlow(ret.bond)}</td><td className={`num ${ret.cash >= 0 ? 'pos' : 'neg'}`}>{fmtFlow(ret.cash)}</td></>}
                  <td className="num">{fmt$(sl.stock)}</td><td className="num">{fmt$(sl.bond)}</td><td className="num">{fmt$(sl.cash)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
