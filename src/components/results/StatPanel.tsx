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
    <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch">
      <HeroSuccessCard
        label={hasProjection ? 'Success rate (observed)' : '% success'}
        rate={result.successRate}
      />
      <div className="grid grid-cols-2 auto-rows-fr gap-3 flex-1">
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted px-3 py-2 rounded-md flex flex-col justify-center">
      <div className="text-2xs text-text-muted uppercase tracking-[0.04em] leading-tight">{label}</div>
      <div className="text-lg font-medium mt-0.5">{value}</div>
    </div>
  );
}

function HeroSuccessCard({ label, rate }: { label: string; rate: number }) {
  return (
    <div className="bg-surface rounded-md shadow-card border-t-2 border-survived px-4 py-3 flex flex-col items-center justify-center text-center sm:w-[196px] flex-shrink-0">
      <div className="text-xs text-text-muted uppercase tracking-[0.04em] mb-2">{label}</div>
      {Number.isFinite(rate) ? (
        <SuccessDonut rate={rate} />
      ) : (
        <span className="text-xl font-semibold">—</span>
      )}
    </div>
  );
}

function SuccessDonut({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(1, rate));
  const D = 96;
  const cx = D / 2;
  const r = 39;
  const sw = 10;
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
          strokeLinecap="butt"
        />
      </g>
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={19}
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
