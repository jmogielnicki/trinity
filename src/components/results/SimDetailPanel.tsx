import { useMemo, useState, useRef } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import type { SimulationResult, Sleeves, YearStateRecord } from '../../engine/types';
import { ASSET } from '../colors';

type Props = {
  sim: SimulationResult;
  initialBalance: number;
  onClose?: () => void;
};

// Cash return data only begins in 1934. Before that the cash sleeve is held
// flat at 0% real (a conservative assumption, not measured data) — the chart
// draws that portion in a faded violet so observed and assumed holdings are
// visually distinguishable.
const CASH_DATA_START_YEAR = 1934;

// A pale wash of ASSET.cash (#7c3aed) for the pre-1934 "assumed" range.
const ASSUMED_CASH_FILL = 'rgba(124, 58, 237, 0.28)';

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

  const chartRef = useRef<HighchartsReact.RefObject>(null);

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

  const [detailMode, setDetailMode] = useState(false);

  const hasRefill = useMemo(
    () => trajectory.some((r) => {
      const f = r.refillFlow;
      return f && (Math.abs(f.stock) > 1 || Math.abs(f.bond) > 1 || Math.abs(f.cash) > 1);
    }),
    [trajectory],
  );

  // Build Highcharts options: single chart, two y-axes.
  // yAxis[0] = sleeve balances (stacked area, top 75%)
  // yAxis[1] = withdrawals (stacked column, bottom 25%)
  const options: Options = useMemo(() => {
    // Sleeve balance series data
    const stockData = trajectory.map((r) => [r.t, r.sleeves.stock] as [number, number]);
    const bondData = trajectory.map((r) => [r.t, r.sleeves.bond] as [number, number]);
    const cashData = trajectory.map((r) => [r.t, r.sleeves.cash] as [number, number]);

    // Withdrawal series data by sleeve
    const wdStockData = trajectory.map((r) => [r.t, (r.withdrawalBySleeve ?? zeroSleeves()).stock] as [number, number]);
    const wdBondData = trajectory.map((r) => [r.t, (r.withdrawalBySleeve ?? zeroSleeves()).bond] as [number, number]);
    const wdCashData = trajectory.map((r) => [r.t, (r.withdrawalBySleeve ?? zeroSleeves()).cash] as [number, number]);

    // Calendar year labels: show every ~8 ticks
    const calStep = Math.ceil(trajectory.length / 8);
    const xCategories: Record<number, string> = {};
    trajectory.forEach((r) => {
      if (r.t % calStep === 0 || r.t === trajectory.length - 1) {
        xCategories[r.t] = String(r.calendarYear);
      }
    });

    const horizonMax = Math.max(1, trajectory.length - 1);

    // Last trajectory index whose calendar year predates cash data. Used to
    // hatch the cash area (and shade the x-axis) over the assumed range.
    const lastAssumedCashT = startYear < CASH_DATA_START_YEAR
      ? Math.min(trajectory.length - 1, CASH_DATA_START_YEAR - startYear - 1)
      : -1;
    const hasAssumedCash = lastAssumedCashT >= 0;

    // Depletion plotLine
    const plotLines: Highcharts.XAxisPlotLinesOptions[] = depletedAt != null
      ? [{ value: depletedAt, color: '#d33', width: 1, dashStyle: 'Dash', zIndex: 5 }]
      : [];

    // Shade the pre-1934 range where cash returns are assumed, not measured.
    const plotBands: Highcharts.XAxisPlotBandsOptions[] = hasAssumedCash
      ? [{
          from: -0.5,
          to: lastAssumedCashT + 0.5,
          color: 'rgba(0,0,0,0.035)',
        }]
      : [];

    return {
      chart: {
        width: 760,
        height: 260,
        margin: [12, 16, 56, 70],
        zooming: { type: undefined } as any,
      },
      xAxis: {
        min: 0,
        max: horizonMax,
        title: { text: 'years into retirement / calendar year' },
        tickInterval: Math.ceil(horizonMax / 8) || 1,
        plotLines,
        plotBands,
        labels: {
          formatter() {
            const t = this.value as number;
            const cal = xCategories[Math.round(t)];
            // Show "y{t}\n{cal}" — use two lines via HTML
            return cal
              ? `<span style="font-size:9px;color:#888">y${Math.round(t)}<br/><span style="color:#666">${cal}</span></span>`
              : `<span style="font-size:9px;color:#888">y${Math.round(t)}</span>`;
          },
          useHTML: true,
        },
      },
      yAxis: [
        {
          // Axis 0: sleeve balances (top 75%)
          title: { text: 'holdings (real $)', style: { fontSize: '10px', color: '#555' } },
          height: '72%',
          top: '0%',
          offset: 0,
          labels: {
            formatter() {
              return fmt$(this.value as number);
            },
            style: { fontSize: '10px' },
          },
          tickAmount: 5,
          min: 0,
        },
        {
          // Axis 1: withdrawals (bottom 25%)
          title: { text: 'w/d', style: { fontSize: '9px', color: '#888' } },
          height: '22%',
          top: '78%',
          offset: 0,
          labels: {
            formatter() {
              return fmt$(this.value as number);
            },
            style: { fontSize: '10px' },
          },
          tickAmount: 3,
          min: 0,
          gridLineColor: '#f5f5f5',
        },
      ],
      tooltip: {
        formatter() {
          const t = this.x as number;
          const idx = Math.round(t);
          const r: YearStateRecord | undefined = trajectory[idx];
          if (!r) return false;
          const wb = r.withdrawalBySleeve ?? zeroSleeves();
          const lines = [
            `<b>Year ${r.t} · ${r.calendarYear}</b>`,
            `Balance: ${fmt$(r.balance)}`,
            `Holdings: ${fmt$(r.sleeves.stock)} stk · ${fmt$(r.sleeves.bond)} bnd · ${fmt$(r.sleeves.cash)} csh`,
            `Withdrawal: ${fmt$(r.withdrawal)} (${fmtPct(r.withdrawal / initialBalance)} of initial)`,
            `  drawn: ${fmt$(wb.stock)} stk · ${fmt$(wb.bond)} bnd · ${fmt$(wb.cash)} csh`,
            r.return != null ? `Return: ${fmtPct(r.return)} ${r.return >= 0 ? '▲' : '▼'}` : null,
            r.calendarYear < CASH_DATA_START_YEAR
              ? `<span style="color:#999">cash return assumed 0% real (pre-${CASH_DATA_START_YEAR})</span>`
              : null,
          ].filter(Boolean) as string[];
          return lines.join('<br/>');
        },
        shared: false,
        crosshairs: true,
      },
      plotOptions: {
        area: {
          stacking: 'normal',
          marker: { enabled: false },
          fillOpacity: 0.85,
          lineWidth: 0,
          trackByArea: false,
        },
        column: {
          stacking: 'normal',
          borderWidth: 0,
          pointPadding: 0,
          groupPadding: 0.02,
        },
      },
      series: [
        // Sleeve balance stacked areas (yAxis 0) — stock at bottom, cash at top
        {
          type: 'area',
          name: 'stock',
          data: stockData,
          color: ASSET.stock,
          yAxis: 0,
          zIndex: 2,
        } as Highcharts.SeriesAreaOptions,
        {
          type: 'area',
          name: 'bond',
          data: bondData,
          color: ASSET.bond,
          yAxis: 0,
          zIndex: 2,
        } as Highcharts.SeriesAreaOptions,
        {
          type: 'area',
          name: 'cash',
          data: cashData,
          color: ASSET.cash,
          yAxis: 0,
          zIndex: 2,
          // Fade the cash fill over years that predate cash return data.
          ...(hasAssumedCash
            ? {
                zoneAxis: 'x',
                zones: [
                  { value: lastAssumedCashT + 0.5, fillColor: ASSUMED_CASH_FILL },
                  {},
                ],
              }
            : {}),
        } as Highcharts.SeriesAreaOptions,
        // Withdrawal stacked columns (yAxis 1)
        {
          type: 'column',
          name: 'wd-stock',
          data: wdStockData,
          color: ASSET.stock,
          yAxis: 1,
          zIndex: 1,
          opacity: 0.85,
        } as Highcharts.SeriesColumnOptions,
        {
          type: 'column',
          name: 'wd-bond',
          data: wdBondData,
          color: ASSET.bond,
          yAxis: 1,
          zIndex: 1,
          opacity: 0.85,
        } as Highcharts.SeriesColumnOptions,
        {
          type: 'column',
          name: 'wd-cash',
          data: wdCashData,
          color: ASSET.cash,
          yAxis: 1,
          zIndex: 1,
          opacity: 0.85,
        } as Highcharts.SeriesColumnOptions,
      ],
    };
  }, [trajectory, startYear, depletedAt, initialBalance]);

  const showsAssumedCash = startYear < CASH_DATA_START_YEAR;

  const statusCls = failed
    ? 'bg-error-bg text-error'
    : inProgress
      ? 'bg-surface-muted text-text-muted'
      : 'bg-success-bg text-success';

  return (
    <div className="mt-4 border border-border-light rounded-md bg-surface-page px-[14px] py-3">
      <div className="flex items-start justify-between gap-3 mb-[10px]">
        <div className="flex flex-wrap items-center gap-[10px] text-base">
          <span className="font-semibold text-text">Start {startYear}</span>
          <span className={`text-sm px-2 py-0.5 rounded-[10px] font-medium ${statusCls}`}>
            {status}
          </span>
          <span className="flex flex-wrap gap-[14px] text-sm text-text-secondary">
            {!failed && <span>Final: <strong className="text-text">{fmt$(summary.finalBalance)}</strong></span>}
            <span>Peak: <strong className="text-text">{fmt$(summary.peakBalance)}</strong> (yr {summary.peakYear})</span>
            <span>Total withdrawn: <strong className="text-text">{fmt$(summary.totalWithdrawn)}</strong></span>
          </span>
        </div>
        {onClose && (
          <button
            className="flex-shrink-0 border border-text-disabled bg-surface rounded-[3px] px-[9px] py-0.5 text-[15px] leading-none cursor-pointer text-text-muted hover:bg-surface-hover hover:text-text"
            onClick={onClose}
            title="Close detail"
          >×</button>
        )}
      </div>

      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />

      <ul className="list-none p-0 mt-1 flex flex-wrap gap-x-[14px] gap-y-1 text-xs text-text-secondary">
        <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: ASSET.stock }} /> stocks</li>
        <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: ASSET.bond }} /> bonds</li>
        <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: ASSET.cash }} /> cash</li>
        <li className="text-text-faint">filled area = holdings · bars = withdrawals by source</li>
      </ul>

      {showsAssumedCash && (
        <p className="mt-1.5 mb-0 text-2xs leading-[1.4] text-text-placeholder max-w-[760px]">
          Cash return data begins in {CASH_DATA_START_YEAR}. Earlier years
          (faded violet) hold the cash sleeve flat at 0% real — a conservative
          assumption, not measured data.
        </p>
      )}

      {/* Year-by-year data table */}
      <div className="flex items-center gap-[10px] mt-[10px] mb-1">
        <span className="text-xs text-text-muted uppercase tracking-[0.04em]">Year-by-year detail</span>
        <button
          className={`text-xs px-[9px] py-0.5 border border-text-disabled bg-surface rounded-[3px] cursor-pointer text-text-secondary hover:bg-surface-hover${detailMode ? ' bg-surface-code border-border-hover text-primary' : ''}`}
          onClick={() => setDetailMode((v) => !v)}
        >
          {detailMode ? 'Hide flows' : 'Show flows'}
        </button>
      </div>
      <div className="overflow-x-auto max-h-[260px] overflow-y-auto mt-[10px] border border-border-light rounded">
        <table className="w-full border-collapse text-sm [&_thead]:sticky [&_thead]:top-0 [&_thead]:bg-surface-hover [&_thead]:z-[1] [&_th]:px-[10px] [&_th]:py-[5px] [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-text-muted [&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:border-b [&_th]:border-border [&_th]:whitespace-nowrap [&_td]:px-[10px] [&_td]:py-1 [&_td]:border-b [&_td]:border-border-light [&_td]:whitespace-nowrap [&_tbody_tr:hover_td]:bg-surface-code">
          <thead>
            <tr>
              {/* Base columns */}
              <th rowSpan={2}>Yr</th>
              <th rowSpan={2}>Cal</th>
              <th rowSpan={2} className="text-right tabular-nums">Balance</th>
              <th rowSpan={2} className="text-right tabular-nums">W/D $</th>
              <th rowSpan={2} className="text-right tabular-nums">W/D %</th>
              <th rowSpan={2} className="text-right tabular-nums">Return</th>
              {/* Detail groups */}
              {detailMode && <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">Start balance</th>}
              {detailMode && <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">Withdrawn from</th>}
              {detailMode && <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">Rebalanced (Δ)</th>}
              {detailMode && hasRefill && <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">Bucket refill (Δ)</th>}
              {detailMode && <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">Return earned</th>}
              {/* End sleeves (always shown in detail mode, simplified in basic) */}
              <th colSpan={3} className="text-center bg-surface-panel border-l border-border-light text-2xs px-1.5 py-[3px] tracking-[0.03em]">End balance</th>
            </tr>
            <tr>
              {detailMode && <><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th></>}
              {detailMode && <><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th></>}
              {detailMode && <><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th></>}
              {detailMode && hasRefill && <><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th></>}
              {detailMode && <><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th></>}
              <th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Stock</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Bond</th><th className="text-right tabular-nums text-2xs font-normal text-text-faint bg-surface-panel border-l border-border-light">Cash</th>
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
                <tr key={r.t} className={r.depleted ? '[&_td]:bg-error-bg [&_td]:text-error' : ''}>
                  <td>{r.t}</td>
                  <td>{r.calendarYear}</td>
                  <td className="text-right tabular-nums">{fmt$(r.balance)}</td>
                  <td className="text-right tabular-nums">{fmt$(r.withdrawal)}</td>
                  <td className="text-right tabular-nums">{fmtPct(r.withdrawal / initialBalance)}</td>
                  <td className={`text-right tabular-nums ${r.return != null ? (r.return < 0 ? 'text-error' : 'text-success') : ''}`}>
                    {r.return != null ? fmtPct(r.return) : '—'}
                  </td>
                  {detailMode && <><td className="text-right tabular-nums">{fmt$(ss.stock)}</td><td className="text-right tabular-nums">{fmt$(ss.bond)}</td><td className="text-right tabular-nums">{fmt$(ss.cash)}</td></>}
                  {detailMode && <><td className="text-right tabular-nums text-error">{wb.stock > 1 ? fmt$(wb.stock) : '—'}</td><td className="text-right tabular-nums text-error">{wb.bond > 1 ? fmt$(wb.bond) : '—'}</td><td className="text-right tabular-nums text-error">{wb.cash > 1 ? fmt$(wb.cash) : '—'}</td></>}
                  {detailMode && <><td className={`text-right tabular-nums ${rb.stock > 1 ? 'text-success' : rb.stock < -1 ? 'text-error' : ''}`}>{fmtFlow(rb.stock)}</td><td className={`text-right tabular-nums ${rb.bond > 1 ? 'text-success' : rb.bond < -1 ? 'text-error' : ''}`}>{fmtFlow(rb.bond)}</td><td className={`text-right tabular-nums ${rb.cash > 1 ? 'text-success' : rb.cash < -1 ? 'text-error' : ''}`}>{fmtFlow(rb.cash)}</td></>}
                  {detailMode && hasRefill && <><td className={`text-right tabular-nums ${rf.stock > 1 ? 'text-success' : rf.stock < -1 ? 'text-error' : ''}`}>{fmtFlow(rf.stock)}</td><td className={`text-right tabular-nums ${rf.bond > 1 ? 'text-success' : rf.bond < -1 ? 'text-error' : ''}`}>{fmtFlow(rf.bond)}</td><td className={`text-right tabular-nums ${rf.cash > 1 ? 'text-success' : rf.cash < -1 ? 'text-error' : ''}`}>{fmtFlow(rf.cash)}</td></>}
                  {detailMode && <><td className={`text-right tabular-nums ${ret.stock >= 0 ? 'text-success' : 'text-error'}`}>{fmtFlow(ret.stock)}</td><td className={`text-right tabular-nums ${ret.bond >= 0 ? 'text-success' : 'text-error'}`}>{fmtFlow(ret.bond)}</td><td className={`text-right tabular-nums ${ret.cash >= 0 ? 'text-success' : 'text-error'}`}>{fmtFlow(ret.cash)}</td></>}
                  <td className="text-right tabular-nums">{fmt$(sl.stock)}</td><td className="text-right tabular-nums">{fmt$(sl.bond)}</td><td className="text-right tabular-nums">{fmt$(sl.cash)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
