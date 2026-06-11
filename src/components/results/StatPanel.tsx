import { avgAnnualWithdrawal, minBalanceReached, spendingStats } from '../../engine/stats';
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
  const spending = spendingStats(result.sims);

  const hasProjection = result.projectedSuccessRate != null;

  // Concrete failure framing: with ~120 cohorts a percentage hides that
  // "96% vs 97%" is one retirement. Counts + the worst year make it real.
  const failures = Number.isFinite(result.successRate)
    ? Math.round((1 - result.successRate) * result.completedCount)
    : 0;

  return (
    <div className="flex flex-col min-[560px]:flex-row gap-5 items-center min-[560px]:items-stretch">
      <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0 px-2 min-[560px]:px-4">
        {Number.isFinite(result.successRate) ? (
          <SuccessDonut rate={result.successRate} />
        ) : (
          <span className="text-xl font-semibold">—</span>
        )}
        {result.completedCount > 0 && (
          <span className="text-xs text-text-muted text-center leading-tight max-w-[190px]">
            {failures === 0 ? (
              <>money lasted in all {result.completedCount} historical retirements</>
            ) : (
              <>
                ran out in{' '}
                <span className="num font-semibold text-text">{failures}</span> of{' '}
                {result.completedCount} historical retirements
                {result.worstStartYear != null && <> · worst: started {result.worstStartYear}</>}
              </>
            )}
          </span>
        )}
        {hasProjection && (
          <span className="text-xs text-text-muted text-center leading-tight">
            <span className="num font-semibold text-text">
              {(result.projectedSuccessRate! * 100).toFixed(1)}%
            </span>{' '}
            projected (bootstrap)
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 min-[840px]:grid-cols-3 gap-3 flex-1 w-full auto-rows-fr">
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
          label="Min balance reached"
          value={Number.isFinite(minBalance) ? fmt(minBalance) : '—'}
          sub="across all years"
          accent="var(--color-negative)"
        />
        <Stat
          label="Avg annual spending"
          value={Number.isFinite(avgWithdrawal) ? fmt(avgWithdrawal) : '—'}
          sub="median cohort"
          accent="var(--color-cash)"
        />
        <Stat
          label="Lowest year's spending"
          value={Number.isFinite(spending.minAnnualSpend) ? fmt(spending.minAnnualSpend) : '—'}
          sub={
            spending.minSpendStartYear != null
              ? `started ${spending.minSpendStartYear}, year ${spending.minSpendAtYear}`
              : undefined
          }
          accent="var(--color-income)"
        />
        <Stat
          label="Worst one-year cut"
          value={
            Number.isFinite(spending.worstCut)
              ? spending.worstCut < 0.0005
                ? 'none'
                : `−${(spending.worstCut * 100).toFixed(0)}%`
              : '—'
          }
          sub={
            spending.worstCut >= 0.0005 && spending.worstCutStartYear != null
              ? `started ${spending.worstCutStartYear} cohort`
              : 'spending never dropped'
          }
          accent="var(--color-stale, var(--color-accent))"
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
      className="bg-surface-muted px-4 py-3 rounded-md flex flex-col justify-center"
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      <div className="text-2xs text-text-muted uppercase tracking-[0.08em] leading-tight">{label}</div>
      <div className="num text-xl font-bold mt-1.5 leading-none">{value}</div>
      {sub && <div className="text-xs text-text-faint mt-1.5 leading-tight">{sub}</div>}
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
  const successLen = clamped * c;
  return (
    <svg
      viewBox={`0 0 ${D} ${D}`}
      className="flex-shrink-0 w-44 h-44 min-[560px]:w-48 min-[560px]:h-48"
      role="img"
      aria-label={`${pct} percent success`}
    >
      {/* Red failure track fills the ring; green success arc overlays the
          leading portion. Butt caps → a crisp straight division between the
          two, prioritising data legibility. */}
      <g transform={`translate(${cx},${cx}) rotate(-90)`}>
        <circle r={r} fill="none" stroke="var(--color-depleted)" strokeWidth={sw} />
        <circle
          r={r}
          fill="none"
          stroke="var(--color-survived)"
          strokeWidth={sw}
          strokeDasharray={`${successLen} ${c}`}
          strokeLinecap="butt"
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
