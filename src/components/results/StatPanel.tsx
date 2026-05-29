import { avgAnnualWithdrawal, minBalanceReached } from '../../engine/stats';
import type { ScenarioResult } from '../../engine/types';
import { CHART } from '../colors';

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
    <div className="flex flex-col min-[450px]:flex-row gap-3 items-stretch min-[1100px]:items-start">
      <HeroSuccessCard rate={result.successRate} />
      <div className="grid grid-cols-2 min-[1100px]:grid-cols-4 auto-rows-fr min-[1100px]:auto-rows-min gap-3 flex-1">
        {hasProjection && (
          <Stat
            label="Success rate (bootstrap-projected)"
            value={`${(result.projectedSuccessRate! * 100).toFixed(1)}%`}
            sub="sampled tails"
            accent="var(--color-success)"
          />
        )}
        <Stat
          label="Median final balance"
          value={Number.isFinite(finalP50) ? fmt(finalP50) : '—'}
          sub="real, today's $"
          accent="var(--color-primary)"
        />
        <Stat
          label="5th-pct final balance"
          value={Number.isFinite(finalP5) ? fmt(finalP5) : '—'}
          sub="worst survivors"
          accent="var(--color-accent)"
        />
        <Stat
          label="Avg annual withdrawal"
          value={Number.isFinite(avgWithdrawal) ? fmt(avgWithdrawal) : '—'}
          sub="per year"
          accent="var(--color-cash)"
        />
        <Stat
          label="Min balance reached"
          value={Number.isFinite(minBalance) ? fmt(minBalance) : '—'}
          sub="across all years"
          accent="var(--color-negative)"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="bg-surface-muted px-3.5 py-2.5 rounded-md flex flex-col justify-center"
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      <div className="text-2xs text-text-muted uppercase tracking-[0.04em] leading-tight">{label}</div>
      <div className="tnum text-lg font-semibold mt-1 leading-none">{value}</div>
      {sub && <div className="text-2xs text-text-faint mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

function HeroSuccessCard({ rate }: { rate: number }) {
  return (
    <div className="flex items-center justify-center min-[450px]:w-[220px] md:w-[180px] min-[1100px]:w-[220px] flex-shrink-0">
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
  const pct = Math.floor(clamped * 100);
  const D = 160;
  const cx = D / 2;
  const r = 66;
  const sw = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox={`0 0 ${D} ${D}`}
      className="flex-shrink-0 w-40 h-40 min-[1100px]:w-32 min-[1100px]:h-32"
      role="img"
      aria-label={`${pct} percent success`}
    >
      <g transform={`translate(${cx},${cx})`}>
        <circle r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={sw} />
        <circle
          r={r}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth={sw}
          strokeDasharray={`${clamped * c} ${c}`}
          transform="rotate(-90)"
          strokeLinecap="round"
        />
      </g>
      <text
        x={cx}
        y={cx - 8}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={38}
        fontWeight={700}
        fill="var(--color-primary)"
      >
        {`${pct}%`}
      </text>
      <text
        x={cx}
        y={cx + 24}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight={500}
        fill={CHART.muted}
      >
        success
      </text>
    </svg>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
