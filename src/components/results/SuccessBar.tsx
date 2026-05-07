import type { ScenarioResult } from '../../engine/types';

type Props = {
  result: ScenarioResult;
  height?: number;
};

/**
 * Single-glance success-rate indicator. Vertical stacked bar — blue for
 * survived, red for depleted, gray for in-progress. Sized to read alongside
 * the spaghetti chart at a glance.
 */
export function SuccessBar({ result, height = 460 }: Props) {
  const total = result.sims.length;
  if (total === 0) return null;
  const failed = result.sims.filter(
    (s) => !s.success && !s.inProgress,
  ).length;
  const inProgress = result.inProgressCount;
  const survived = total - failed - inProgress;

  const survPct = (survived / total) * 100;
  const failPct = (failed / total) * 100;
  const ipPct = (inProgress / total) * 100;

  const successRateLabel = Number.isFinite(result.successRate)
    ? `${(result.successRate * 100).toFixed(1)}%`
    : '—';

  return (
    <div className="success-bar" style={{ height }}>
      <div className="success-bar-label">
        <div className="success-bar-pct">{successRateLabel}</div>
        <div className="success-bar-meta">
          {survived}/{total - inProgress} completed
        </div>
      </div>
      <div className="success-bar-track">
        {survived > 0 && (
          <div
            className="success-bar-seg seg-survived"
            style={{ height: `${survPct}%` }}
            title={`${survived} survived`}
          />
        )}
        {inProgress > 0 && (
          <div
            className="success-bar-seg seg-inprogress"
            style={{ height: `${ipPct}%` }}
            title={`${inProgress} in-progress`}
          />
        )}
        {failed > 0 && (
          <div
            className="success-bar-seg seg-failed"
            style={{ height: `${failPct}%` }}
            title={`${failed} depleted`}
          />
        )}
      </div>
    </div>
  );
}
