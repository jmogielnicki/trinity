import type { ReactNode } from 'react';
import { avgAnnualWithdrawal, minBalanceReached } from '../../engine/stats';
import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
};

export function StatPanel({ result }: Props) {
  const finalP50 =
    result.percentiles.length > 0
      ? result.percentiles[result.percentiles.length - 1].values.p50
      : NaN;
  const finalP5 =
    result.percentiles.length > 0
      ? result.percentiles[result.percentiles.length - 1].values.p5
      : NaN;
  const minBalance = minBalanceReached(result.sims);
  const avgWithdrawal = avgAnnualWithdrawal(result.sims);

  const hasProjection = result.projectedSuccessRate != null;

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-3 mb-4">
      <Stat
        label={hasProjection ? 'Success rate (observed)' : '% success'}
        value={
          Number.isFinite(result.successRate)
            ? `${(result.successRate * 100).toFixed(1)}%`
            : '—'
        }
        accessory={
          Number.isFinite(result.successRate) ? (
            <SuccessDonut rate={result.successRate} />
          ) : undefined
        }
      />
      {hasProjection && (
        <Stat
          label="Success rate (bootstrap-projected)"
          value={`${(result.projectedSuccessRate! * 100).toFixed(1)}%`}
        />
      )}
      <Stat
        label="Median final balance"
        value={Number.isFinite(finalP50) ? fmt(finalP50) : '—'}
      />
      <Stat
        label="5th-pct final balance"
        value={Number.isFinite(finalP5) ? fmt(finalP5) : '—'}
      />
      <Stat
        label="Avg annual withdrawal"
        value={Number.isFinite(avgWithdrawal) ? fmt(avgWithdrawal) : '—'}
      />
      <Stat
        label="Min balance reached"
        value={Number.isFinite(minBalance) ? fmt(minBalance) : '—'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accessory,
}: {
  label: string;
  value: string;
  accessory?: ReactNode;
}) {
  return (
    <div className="bg-surface-muted px-3 py-2.5 rounded-md">
      <div className="text-xs text-text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-medium mt-0.5">{value}</div>
        {accessory}
      </div>
    </div>
  );
}

function SuccessDonut({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(1, rate));
  const r = 13;
  const sw = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={34} height={34} viewBox="0 0 34 34" className="flex-shrink-0" aria-hidden="true">
      <g transform="translate(17,17)">
        <circle r={r} fill="none" stroke={OUTCOME.depleted} strokeWidth={sw} />
        <circle
          r={r}
          fill="none"
          stroke={OUTCOME.survived}
          strokeWidth={sw}
          strokeDasharray={`${clamped * c} ${c}`}
          transform="rotate(-90)"
        />
      </g>
    </svg>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
