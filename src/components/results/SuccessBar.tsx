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
 */
export function SuccessBar({ result, height = 460 }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
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

  const onHover = (
    e: React.MouseEvent<HTMLDivElement>,
    label: string,
    count: number,
  ) => {
    setHover({
      label,
      count,
      pctOfAll: (count / total) * 100,
      px: e.clientX,
      py: e.clientY,
    });
  };

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
            className="success-bar-seg"
            style={{ height: `${survPct}%`, background: OUTCOME.survived }}
            onMouseEnter={(e) => onHover(e, 'survived', survived)}
            onMouseMove={(e) => onHover(e, 'survived', survived)}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {inProgress > 0 && (
          <div
            className="success-bar-seg"
            style={{ height: `${ipPct}%`, background: OUTCOME.inProgress }}
            onMouseEnter={(e) => onHover(e, 'in-progress', inProgress)}
            onMouseMove={(e) => onHover(e, 'in-progress', inProgress)}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {failed > 0 && (
          <div
            className="success-bar-seg"
            style={{ height: `${failPct}%`, background: OUTCOME.depleted }}
            onMouseEnter={(e) => onHover(e, 'depleted', failed)}
            onMouseMove={(e) => onHover(e, 'depleted', failed)}
            onMouseLeave={() => setHover(null)}
          />
        )}
      </div>
      {hover && (
        <div
          className="success-tip"
          style={{
            left: hover.px + 12,
            top: hover.py + 12,
          }}
        >
          <strong>{hover.label}</strong>: {hover.count} sims (
          {hover.pctOfAll.toFixed(1)}% of all)
        </div>
      )}
    </div>
  );
}
