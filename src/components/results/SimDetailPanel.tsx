import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { area } from 'd3-shape';
import type { SimulationResult, Sleeves, YearStateRecord } from '../../engine/types';
import { ASSET } from '../colors';

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

const SLEEVE_LABEL: Record<keyof Sleeves, string> = {
  stock: 'stocks',
  bond: 'bonds',
  cash: 'cash',
};

type Transfer = { from: keyof Sleeves; to: keyof Sleeves; amount: number };

/**
 * Reduce a net per-sleeve flow (which sums to ~0) into discrete
 * source→destination transfers by greedily pairing outflows with inflows.
 */
function deriveTransfers(flow: Sleeves | undefined): Transfer[] {
  if (!flow) return [];
  const keys: (keyof Sleeves)[] = ['stock', 'bond', 'cash'];
  const sources = keys.filter((k) => flow[k] < -1).map((k) => ({ k, amt: -flow[k] }));
  const dests = keys.filter((k) => flow[k] > 1).map((k) => ({ k, amt: flow[k] }));
  const transfers: Transfer[] = [];
  let si = 0;
  let di = 0;
  while (si < sources.length && di < dests.length) {
    const amt = Math.min(sources[si].amt, dests[di].amt);
    transfers.push({ from: sources[si].k, to: dests[di].k, amount: amt });
    sources[si].amt -= amt;
    dests[di].amt -= amt;
    if (sources[si].amt < 1) si++;
    if (dests[di].amt < 1) di++;
  }
  return transfers;
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

  // Chart geometry: a sleeve-composition stacked area on top, and a
  // withdrawal strip below whose bars are stacked by the sleeve each
  // dollar was drawn from — so one stock/bond/cash legend covers both.
  const margin = { top: 12, right: 16, bottom: 44, left: 70 };
  const chartW = 760;
  const areaH = 150;
  const gap = 10;
  const wdH = 48;
  const innerH = areaH + gap + wdH;
  const chartH = innerH + margin.top + margin.bottom;
  const innerW = chartW - margin.left - margin.right;
  const wdBaseline = areaH + gap + wdH;

  const xScale = scaleLinear()
    .domain([0, Math.max(1, trajectory.length - 1)])
    .range([0, innerW]);

  // Per-year sleeve balances (post-return) — these stack to the total balance.
  const sleevePoints = useMemo(
    () =>
      trajectory.map((r) => {
        const s = r.sleeves;
        return {
          t: r.t,
          stock: s.stock,
          bond: s.bond,
          cash: s.cash,
          total: s.stock + s.bond + s.cash,
        };
      }),
    [trajectory],
  );

  const maxTotal = useMemo(
    () => sleevePoints.reduce((m, p) => Math.max(m, p.total), 0) || 1,
    [sleevePoints],
  );
  const ySleeve = scaleLinear().domain([0, maxTotal]).range([areaH, 0]).nice();

  const maxWd = useMemo(
    () => trajectory.reduce((m, r) => Math.max(m, r.withdrawal), 0) || 1,
    [trajectory],
  );
  const yWdScale = scaleLinear().domain([0, maxWd]).range([0, wdH - 4]);

  // Stacked sleeve bands (stocks bottom, bonds middle, cash top).
  type Band = { t: number; y0: number; y1: number };
  const stockBand: Band[] = sleevePoints.map((p) => ({ t: p.t, y0: 0, y1: p.stock }));
  const bondBand: Band[] = sleevePoints.map((p) => ({
    t: p.t,
    y0: p.stock,
    y1: p.stock + p.bond,
  }));
  const cashBand: Band[] = sleevePoints.map((p) => ({
    t: p.t,
    y0: p.stock + p.bond,
    y1: p.total,
  }));
  const areaGen = area<Band>()
    .x((d) => xScale(d.t))
    .y0((d) => ySleeve(d.y0))
    .y1((d) => ySleeve(d.y1));

  const yTicks = ySleeve.ticks(4);
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
  const [showAllFlows, setShowAllFlows] = useState(false);

  // Inter-bucket flows (annual rebalance + bucket refill) per year, with the
  // pixel mid-y of each sleeve's band so flow ribbons land inside the bands.
  type YearFlow = {
    t: number;
    mid: Record<keyof Sleeves, number>;
    transfers: (Transfer & { kind: 'rebalance' | 'refill' })[];
    volume: number;
  };
  const flowYears: YearFlow[] = trajectory.map((r) => {
    const sl = r.sleeves;
    const mid: Record<keyof Sleeves, number> = {
      stock: ySleeve(sl.stock / 2),
      bond: ySleeve(sl.stock + sl.bond / 2),
      cash: ySleeve(sl.stock + sl.bond + sl.cash / 2),
    };
    const transfers = [
      ...deriveTransfers(r.rebalanceFlow).map((x) => ({ ...x, kind: 'rebalance' as const })),
      ...deriveTransfers(r.refillFlow).map((x) => ({ ...x, kind: 'refill' as const })),
    ];
    const volume = transfers.reduce((s, x) => s + x.amount, 0);
    return { t: r.t, mid, transfers, volume };
  });
  const maxFlowVolume = Math.max(1, ...flowYears.map((f) => f.volume));
  const hasFlows = flowYears.some((f) => f.transfers.length > 0);

  // A single year's transfers drawn as vertical Sankey-style ribbons centred
  // on that year's x tick: thickness encodes $ moved, gradient runs from the
  // source sleeve colour to the destination, arrowhead marks the direction.
  function renderYearFlows(f: YearFlow, key: string) {
    if (!f.transfers.length) return null;
    const cx = xScale(f.t);
    const n = f.transfers.length;
    return (
      <g key={key} pointerEvents="none">
        {f.transfers.map((tr, i) => {
          const th = Math.max(3.5, areaH - ySleeve(tr.amount));
          const x = cx + (i - (n - 1) / 2) * 18;
          const srcY = f.mid[tr.from];
          const destY = f.mid[tr.to];
          const dir = destY < srcY ? -1 : 1;
          const arrowLen = Math.min(18, Math.max(9, th + 6));
          const halfW = Math.max(5.5, th / 2 + 3);
          let baseY = destY - dir * arrowLen;
          if (dir * (baseY - srcY) < 0) baseY = srcY;
          const gid = `${key}-${i}`;
          return (
            <g key={i}>
              <defs>
                <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={x} y1={srcY} x2={x} y2={destY}>
                  <stop offset="0%" stopColor={ASSET[tr.from]} />
                  <stop offset="100%" stopColor={ASSET[tr.to]} />
                </linearGradient>
              </defs>
              <line x1={x} y1={srcY} x2={x} y2={baseY} stroke="#fff" strokeWidth={th + 3} strokeLinecap="round" strokeOpacity={0.95} />
              <line x1={x} y1={srcY} x2={x} y2={baseY} stroke={`url(#${gid})`} strokeWidth={th} strokeLinecap="round" />
              <polygon
                points={`${x - halfW},${baseY} ${x + halfW},${baseY} ${x},${destY}`}
                fill={ASSET[tr.to]}
                stroke="#fff"
                strokeWidth={1}
                strokeLinejoin="round"
              />
              <circle cx={x} cy={srcY} r={Math.max(2.5, th / 2)} fill={ASSET[tr.from]} stroke="#fff" strokeWidth={1} />
            </g>
          );
        })}
      </g>
    );
  }

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

      <svg width={chartW} height={chartH} className="sim-detail-chart">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Gridlines + y-axis labels (balance) */}
          {yTicks.map((v) => (
            <g key={v} transform={`translate(0,${ySleeve(v)})`}>
              <line x1={0} x2={innerW} stroke="#eee" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill="#888">
                {fmt$(v)}
              </text>
            </g>
          ))}

          {/* Stacked sleeve composition — the top edge is the total balance */}
          <path d={areaGen(stockBand) ?? ''} fill={ASSET.stock} fillOpacity={0.85} />
          <path d={areaGen(bondBand) ?? ''} fill={ASSET.bond} fillOpacity={0.85} />
          <path d={areaGen(cashBand) ?? ''} fill={ASSET.cash} fillOpacity={0.85} />

          {/* Depletion marker */}
          {depletedAt != null && (
            <line
              x1={xScale(depletedAt)}
              x2={xScale(depletedAt)}
              y1={0}
              y2={wdBaseline}
              stroke="#d33"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Rebalance-activity rail: a tick per year that moved money between
              buckets, opacity scaled to the $ volume so big moves stand out. */}
          {flowYears.map((f) =>
            f.volume > 1 ? (
              <line
                key={`rail-${f.t}`}
                x1={xScale(f.t)}
                x2={xScale(f.t)}
                y1={0}
                y2={hoveredT === f.t ? 9 : 6}
                stroke={hoveredT === f.t ? '#444' : '#8a8a8a'}
                strokeWidth={1.5}
                strokeOpacity={
                  hoveredT === f.t ? 0.9 : 0.2 + 0.55 * (f.volume / maxFlowVolume)
                }
              />
            ) : null,
          )}

          {/* Flow ribbons: every material year when "all" is on, otherwise
              just the hovered year. */}
          {showAllFlows
            ? flowYears.map((f) =>
                f.volume > 1 ? renderYearFlows(f, `flow-${f.t}`) : null,
              )
            : hoveredT != null && flowYears[hoveredT]
              ? renderYearFlows(flowYears[hoveredT], 'flow-hover')
              : null}

          {/* Balance axis label */}
          <text
            transform={`translate(${-52},${areaH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
          >
            holdings (real $)
          </text>

          {/* Separator */}
          <line
            x1={0} x2={innerW}
            y1={areaH + gap / 2} y2={areaH + gap / 2}
            stroke="#e0e0e0"
          />

          {/* Withdrawal bars, stacked by source sleeve */}
          {trajectory.map((r) => {
            const wb = r.withdrawalBySleeve ?? zeroSleeves();
            const hStock = yWdScale(Math.max(0, wb.stock));
            const hBond = yWdScale(Math.max(0, wb.bond));
            const hCash = yWdScale(Math.max(0, wb.cash));
            const x = xScale(r.t) - barW / 2;
            const yStock = wdBaseline - hStock;
            const yBond = yStock - hBond;
            const yCash = yBond - hCash;
            return (
              <g key={r.t}>
                <rect x={x} y={yStock} width={barW} height={hStock} fill={ASSET.stock} fillOpacity={0.85} />
                <rect x={x} y={yBond} width={barW} height={hBond} fill={ASSET.bond} fillOpacity={0.85} />
                <rect x={x} y={yCash} width={barW} height={hCash} fill={ASSET.cash} fillOpacity={0.85} />
              </g>
            );
          })}

          {/* Withdrawal axis label */}
          <text
            x={-8}
            y={wdBaseline - wdH / 2}
            dy="0.32em"
            textAnchor="end"
            fontSize={9}
            fill="#888"
          >
            w/d
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
              {/* Dot on top of the stacked area (= total balance) */}
              <circle
                cx={xScale(hoveredT)}
                cy={ySleeve(
                  hoveredRecord.sleeves.stock +
                    hoveredRecord.sleeves.bond +
                    hoveredRecord.sleeves.cash,
                )}
                r={4}
                fill="#222"
                stroke="#fff"
                strokeWidth={1.5}
              />
              {/* Dot on top of the withdrawal stack */}
              {hoveredRecord.withdrawal > 0 && (
                <circle
                  cx={xScale(hoveredT)}
                  cy={wdBaseline - yWdScale(hoveredRecord.withdrawal)}
                  r={3}
                  fill="#222"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )}
              {/* Tooltip box */}
              {(() => {
                const r = hoveredRecord;
                const wb = r.withdrawalBySleeve ?? zeroSleeves();
                const tipLines = [
                  `Year ${r.t}  ·  ${r.calendarYear}`,
                  `Balance: ${fmt$(r.balance)}`,
                  `Holdings: ${fmt$(r.sleeves.stock)} stk · ${fmt$(r.sleeves.bond)} bnd · ${fmt$(r.sleeves.cash)} csh`,
                  `Withdrawal: ${fmt$(r.withdrawal)}  (${fmtPct(r.withdrawal / initialBalance)} of initial)`,
                  `  drawn from: ${fmt$(wb.stock)} stk · ${fmt$(wb.bond)} bnd · ${fmt$(wb.cash)} csh`,
                  r.return != null
                    ? `Return: ${fmtPct(r.return)}  ${r.return >= 0 ? '▲' : '▼'}`
                    : null,
                  ...(flowYears[r.t]?.transfers ?? []).map(
                    (tr) =>
                      `${tr.kind === 'refill' ? 'Bucket refill' : 'Rebalance'}: ` +
                      `${fmt$(tr.amount)} ${SLEEVE_LABEL[tr.from]} → ${SLEEVE_LABEL[tr.to]}`,
                  ),
                ].filter(Boolean) as string[];

                const tipW = 300;
                const tipLineH = 15;
                const tipPad = 8;
                const tipH = tipLines.length * tipLineH + tipPad * 2;
                const cx = xScale(hoveredT);
                const tx = tooltipFlip ? cx - tipW - 10 : cx + 10;
                const ty = Math.max(0, areaH / 2 - tipH / 2);

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

      <div className="sim-detail-chart-footer">
        <ul className="legend-row sim-detail-legend">
          <li><span className="sw" style={{ background: ASSET.stock }} /> stocks</li>
          <li><span className="sw" style={{ background: ASSET.bond }} /> bonds</li>
          <li><span className="sw" style={{ background: ASSET.cash }} /> cash</li>
          <li className="legend-note">
            filled area = holdings · bars = withdrawals · ribbons = money moved between buckets
          </li>
        </ul>
        {hasFlows && (
          <button
            className={`sim-detail-mode-btn ${showAllFlows ? 'active' : ''}`}
            onClick={() => setShowAllFlows((v) => !v)}
            title="Toggle whether rebalancing/refill ribbons show for every year or only on hover"
          >
            {showAllFlows ? 'Flows: all years' : 'Flows: on hover'}
          </button>
        )}
      </div>

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
