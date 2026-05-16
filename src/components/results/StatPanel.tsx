import type { ScenarioResult } from '../../engine/types';

export function StatPanel({ result }: { result: ScenarioResult }) {
  const finalP50 =
    result.percentiles.length > 0
      ? result.percentiles[result.percentiles.length - 1].values.p50
      : NaN;
  const finalP5 =
    result.percentiles.length > 0
      ? result.percentiles[result.percentiles.length - 1].values.p5
      : NaN;

  const hasProjection = result.projectedSuccessRate != null;

  return (
    <div className="stat-panel">
      <Stat
        label={hasProjection ? 'Success rate (observed)' : 'Success rate'}
        value={
          Number.isFinite(result.successRate)
            ? `${(result.successRate * 100).toFixed(1)}%`
            : '—'
        }
      />
      {hasProjection && (
        <Stat
          label="Success rate (bootstrap-projected)"
          value={`${(result.projectedSuccessRate! * 100).toFixed(1)}%`}
        />
      )}
      <Stat label="Cohorts (observed)" value={`${result.completedCount}`} />
      <Stat
        label={hasProjection ? 'Cohorts (projected)' : 'Cohorts (in-progress)'}
        value={`${
          hasProjection
            ? result.projectedCohortCount ?? 0
            : result.inProgressCount
        }`}
      />
      <Stat
        label="Median final balance"
        value={Number.isFinite(finalP50) ? fmt(finalP50) : '—'}
      />
      <Stat
        label="5th-pct final balance"
        value={Number.isFinite(finalP5) ? fmt(finalP5) : '—'}
      />
      <Stat
        label="Worst start year"
        value={result.worstStartYear ? `${result.worstStartYear}` : 'none'}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
