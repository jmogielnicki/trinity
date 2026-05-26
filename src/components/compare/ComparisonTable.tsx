import {
  describeWithdrawal,
  describeAllocation,
  fmtMoney,
} from '../../engine/strategyDescriptions';
import type { CompareEntry } from '../../store/compareScenariosStore';
import { colorAt } from './compareColors';

export function ComparisonTable({ entries }: { entries: CompareEntry[] }) {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={thCls}></th>
            <th className={thCls}>Scenario</th>
            <th className={thCls}>Withdrawal</th>
            <th className={thCls}>Allocation</th>
            <th className={`${thCls} text-right`}>Horizon</th>
            <th className={`${thCls} text-right`}>Start $</th>
            <th className={`${thCls} text-right`}>Success</th>
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
            return (
              <tr key={e.saved.id}>
                <td className={tdCls}>
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ background: colorAt(i) }}
                  />
                </td>
                <td className={tdCls}>{e.saved.name}</td>
                <td className={tdCls}>{describeWithdrawal(e.saved.state.withdrawal)}</td>
                <td className={tdCls}>{describeAllocation(e.saved.state.allocation)}</td>
                <td className={`${tdCls} ${numCls}`}>{e.horizonYears}y</td>
                <td className={`${tdCls} ${numCls}`}>{fmtMoney(e.initialBalance)}</td>
                <td className={`${tdCls} ${lead(m.successRate, bestSuccess)}`}>
                  {Number.isFinite(m.successRate)
                    ? `${(m.successRate * 100).toFixed(1)}%`
                    : '—'}
                </td>
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
    </div>
  );
}
