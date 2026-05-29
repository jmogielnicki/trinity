import { useState } from 'react';
import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  height?: number;
};

type Hover = {
  label: string;
  count: number;
  pctOfAll: number;
  px: number;
  py: number;
};

/**
 * Single-glance success-rate indicator. Vertical stacked bar — blue for
 * survived, red for depleted, gray for in-progress.
 *
 * Segments are weighted by each sim's aggregation weight, so a bootstrap
 * cohort's many tail samples count as one start year rather than out-voting
 * the observed record by the sample multiplier.
 */
export function SuccessBar({ result, height = 460 }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  if (result.sims.length === 0) return null;

  let survived = 0;
  let failed = 0;
  let inProgress = 0;
  for (const s of result.sims) {
    const w = s.weight ?? 1;
    if (s.inProgress) inProgress += w;
    else if (!s.success) failed += w;
    else survived += w;
  }
  const total = survived + failed + inProgress;
  if (total <= 0) return null;

  const survPct = (survived / total) * 100;
  const failPct = (failed / total) * 100;
  const ipPct = (inProgress / total) * 100;

  const hasProjection = result.projectedSuccessRate != null;
  const successRateLabel = Number.isFinite(result.successRate)
    ? `${(result.successRate * 100).toFixed(1)}%`
    : '—';

  const onHover = (
    e: React.MouseEvent<HTMLDivElement>,
    label: string,
    count: number,
  ) => {
    setHover({
      label,
      count: Math.round(count),
      pctOfAll: (count / total) * 100,
      px: e.clientX,
      py: e.clientY,
    });
  };

  return (
    <div className="flex flex-col items-center gap-1.5 pt-4" style={{ height }}>
      <div className="text-center">
        <div className="text-base font-medium text-text" style={{ fontSize: 16 }}>{successRateLabel}</div>
        <div className="text-2xs text-text-faint">
          {hasProjection
            ? `${result.completedCount} observed · ${
                result.projectedCohortCount ?? 0
              } projected`
            : `${Math.round(survived)}/${Math.round(
                total - inProgress,
              )} completed`}
        </div>
        {hasProjection && (
          <div className="text-2xs text-text-faint">
            {`${(result.projectedSuccessRate! * 100).toFixed(1)}% projected`}
          </div>
        )}
      </div>
      <div className="flex-1 w-[18px] flex flex-col border border-text-disabled rounded-xs overflow-hidden bg-surface-hover">
        {survived > 0 && (
          <div
            style={{ height: `${survPct}%`, background: OUTCOME.survived }}
            onMouseEnter={(e) => onHover(e, 'survived', survived)}
            onMouseMove={(e) => onHover(e, 'survived', survived)}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {inProgress > 0 && (
          <div
            style={{ height: `${ipPct}%`, background: OUTCOME.inProgress }}
            onMouseEnter={(e) => onHover(e, 'in-progress', inProgress)}
            onMouseMove={(e) => onHover(e, 'in-progress', inProgress)}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {failed > 0 && (
          <div
            style={{ height: `${failPct}%`, background: OUTCOME.depleted }}
            onMouseEnter={(e) => onHover(e, 'depleted', failed)}
            onMouseMove={(e) => onHover(e, 'depleted', failed)}
            onMouseLeave={() => setHover(null)}
          />
        )}
      </div>
      {hover && (
        <div
          className="fixed bg-surface border border-text-disabled rounded-xs px-2 py-1 text-xs pointer-events-none z-10 shadow-card"
          style={{
            left: hover.px + 12,
            top: hover.py + 12,
          }}
        >
          <strong>{hover.label}</strong>: {hover.count} cohorts (
          {hover.pctOfAll.toFixed(1)}% of all)
        </div>
      )}
    </div>
  );
}
