import { useState } from 'react';
import { fmtMoney } from '../../engine/strategyDescriptions';
import type { CompareEntry } from '../../store/compareScenariosStore';
import { colorAt } from '../seriesColors';
import { StrategyDetails } from './StrategyDetails';

const TABLE_BUCKETS: { label: string; test: (r: number) => boolean }[] = [
  { label: 'Depleted', test: (r) => r <= 0 },
  { label: '< 1×',     test: (r) => r > 0 && r < 1 },
  { label: '1–5×',     test: (r) => r >= 1 && r < 5 },
  { label: '> 5×',     test: (r) => r >= 5 },
];

/** Share of completed observed start years that landed in each outcome bucket. */
function bucketPcts(e: CompareEntry): number[] {
  const init = e.initialBalance;
  const counts = new Array(TABLE_BUCKETS.length).fill(0);
  let total = 0;
  for (const s of e.result.sims) {
    if (s.bootstrapped || s.inProgress) continue;
    total += 1;
    const fb = s.success
      ? s.finalBalance ?? s.trajectory[s.trajectory.length - 1]?.balance ?? 0
      : 0;
    const r = init > 0 ? fb / init : 0;
    const idx = TABLE_BUCKETS.findIndex((b) => b.test(r));
    counts[idx >= 0 ? idx : 0] += 1;
  }
  return counts.map((c) => (total > 0 ? (c / total) * 100 : NaN));
}

export function ComparisonTable({ entries }: { entries: CompareEntry[] }) {
  const [info, setInfo] = useState<CompareEntry | null>(null);

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

  const numCls = 'text-right tabular-nums';
  const leadCls = 'text-right tabular-nums font-semibold text-success';
  const thCls =
    'px-2 py-1.5 text-left text-xs font-medium text-text-muted uppercase tracking-[0.04em] bg-surface-hover border-b border-border-light whitespace-nowrap';
  const tdCls = 'px-2 py-1.5 border-b border-border-light whitespace-nowrap';
  const pctCell = (p: number) => (Number.isFinite(p) ? `${Math.round(p)}%` : '—');

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="bg-surface-hover border-b border-border-light" colSpan={3} />
            <th
              className="px-2 py-1 text-center text-2xs font-semibold text-text-muted uppercase tracking-[0.04em] bg-surface-hover border-b border-l border-r border-border-light whitespace-nowrap"
              colSpan={TABLE_BUCKETS.length}
            >
              Final balance vs initial balance
            </th>
            <th className="bg-surface-hover border-b border-border-light" colSpan={6} />
          </tr>
          <tr>
            <th className={thCls}></th>
            <th className={thCls}>Strategy</th>
            <th className={`${thCls} text-right`}>Success</th>
            {TABLE_BUCKETS.map((b, bi) => (
              <th
                key={b.label}
                className={`${thCls} text-right ${
                  bi === 0 ? 'border-l border-border-light' : ''
                } ${bi === TABLE_BUCKETS.length - 1 ? 'border-r border-border-light' : ''}`}
              >
                {b.label}
              </th>
            ))}
            <th className={`${thCls} text-right`}>P5 final</th>
            <th className={`${thCls} text-right`}>Median final</th>
            <th className={`${thCls} text-right`}>P95 final</th>
            <th className={`${thCls} text-right`}>Avg withdrawal</th>
            <th className={`${thCls} text-right`}>Min balance</th>
            <th className={`${thCls} text-right`}>Worst start</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const m = e.metrics;
            const lead = (v: number, b: number) =>
              Number.isFinite(v) && v === b ? leadCls : numCls;
            const buckets = bucketPcts(e);
            return (
              <tr key={e.saved.id}>
                <td className={tdCls}>
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ background: colorAt(i) }}
                  />
                </td>
                <td className={tdCls}>
                  <span className="inline-flex items-center gap-1.5">
                    {e.saved.name}
                    <button
                      aria-label="Strategy details"
                      title="Strategy details"
                      className="w-4 h-4 inline-flex items-center justify-center rounded-full text-text-faint hover:text-text hover:bg-surface-hover"
                      onClick={() => setInfo(e)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </button>
                  </span>
                </td>
                <td className={`${tdCls} ${lead(m.successRate, bestSuccess)}`}>
                  {Number.isFinite(m.successRate)
                    ? `${(m.successRate * 100).toFixed(1)}%`
                    : '—'}
                </td>
                {buckets.map((p, bi) => (
                  <td key={bi} className={`${tdCls} ${numCls}`}>
                    {pctCell(p)}
                  </td>
                ))}
                <td className={`${tdCls} ${lead(m.p5Final, bestP5)}`}>{fmtMoney(m.p5Final)}</td>
                <td className={`${tdCls} ${lead(m.p50Final, bestP50)}`}>{fmtMoney(m.p50Final)}</td>
                <td className={`${tdCls} ${lead(m.p95Final, bestP95)}`}>{fmtMoney(m.p95Final)}</td>
                <td className={`${tdCls} ${lead(m.avgAnnualWithdrawal, bestAvgWd)}`}>
                  {fmtMoney(m.avgAnnualWithdrawal)}
                </td>
                <td className={`${tdCls} ${bestMin > 0 ? lead(m.minBalance, bestMin) : numCls}`}>
                  {fmtMoney(m.minBalance)}
                </td>
                <td className={`${tdCls} ${numCls}`}>{m.worstStartYear ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {info && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInfo(null)} />
          <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[360px] flex flex-col gap-3 p-5 max-h-[90vh] overflow-y-auto">
            <div className="text-base font-bold text-text">{info.saved.name}</div>
            <StrategyDetails
              allocation={info.saved.state.allocation}
              withdrawal={info.saved.state.withdrawal}
              withdrawalSource={info.saved.state.withdrawalSource}
              className="text-sm gap-y-0.5"
            />
            <div className="flex justify-end">
              <button
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary border border-border cursor-pointer hover:bg-surface-hover"
                onClick={() => setInfo(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
