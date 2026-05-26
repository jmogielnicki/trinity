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
      <SuccessStat
        label={hasProjection ? 'Success rate (observed)' : '% success'}
        rate={result.successRate}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted px-3 py-2.5 rounded-md flex flex-col">
      <div className="text-xs text-text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className="flex-1 flex items-center">
        <div className="text-lg font-medium">{value}</div>
      </div>
    </div>
  );
}

function SuccessStat({ label, rate }: { label: string; rate: number }) {
  return (
    <div className="bg-surface-muted px-3 py-2.5 rounded-md flex flex-col">
      <div className="text-xs text-text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className="flex-1 flex items-center justify-center pt-1.5">
        {Number.isFinite(rate) ? (
          <SuccessDonut rate={rate} />
        ) : (
          <span className="text-lg font-medium">—</span>
        )}
      </div>
    </div>
  );
}

function SuccessDonut({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(1, rate));
  const D = 84;
  const cx = D / 2;
  const r = 34;
  const sw = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={D}
      height={D}
      viewBox={`0 0 ${D} ${D}`}
      className="flex-shrink-0"
      role="img"
      aria-label={`${(clamped * 100).toFixed(1)} percent success`}
    >
      <g transform={`translate(${cx},${cx})`}>
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
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={17}
        fontWeight={600}
        fill={OUTCOME.survived}
      >
        {`${(clamped * 100).toFixed(1)}%`}
      </text>
    </svg>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
