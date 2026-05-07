import { useMemo } from 'react';
import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  width?: number;
};

/**
 * Outcome timeline: one row per start year, x-axis = years into retirement.
 * Each row is a horizontal bar colored by outcome — blue for survived, gray
 * for in-progress, blue → red at the depletion year for failures. Lets you
 * eyeball clusters of bad start years (1929, 1965-69, etc.) as vertical
 * bands of red.
 */
export function OutcomeTimeline({ result, width = 800 }: Props) {
  const sims = useMemo(
    () => [...result.sims].sort((a, b) => a.startYear - b.startYear),
    [result.sims],
  );
  if (sims.length === 0) return null;

  const horizon = sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0);
  const padL = 56;
  const padT = 18;
  const cellW = Math.max(4, Math.min(14, (width - padL - 16) / horizon));
  const rowH = 7;
  const height = padT + sims.length * rowH + 16;

  const yearLabels = sims
    .map((s, i) => ({ year: s.startYear, i }))
    .filter(({ year }) => year % 10 === 0);

  return (
    <div>
      <div className="heatmap-meta">
        Outcome timeline — one row per start year, colored by outcome.
        Vertical bands of red mark the worst cohorts (1929, 1965-69, etc.).
      </div>
      <svg width={width} height={height} className="heatmap">
        {yearLabels.map(({ year, i }) => (
          <text
            key={year}
            x={padL - 6}
            y={padT + i * rowH + rowH - 1}
            textAnchor="end"
            fontSize={10}
            fill="#666"
          >
            {year}
          </text>
        ))}
        {sims.map((s, i) => {
          const failed = !s.success && !s.inProgress;
          const inProgress = s.inProgress;
          const totalYears = s.trajectory.length;
          const failAt = failed ? (s.depletedAt ?? totalYears) : totalYears;

          // Survived (blue) portion: years 0..failAt-1 for failures,
          // years 0..totalYears-1 for surv/in-progress.
          const survEnd = failed ? failAt : totalYears;
          const baseColor = inProgress
            ? OUTCOME.inProgress
            : OUTCOME.survived;

          return (
            <g key={s.startYear}>
              <rect
                x={padL}
                y={padT + i * rowH}
                width={survEnd * cellW}
                height={rowH - 0.5}
                fill={baseColor}
              >
                <title>
                  Started {s.startYear} — {failed ? 'depleted' : inProgress ? 'in-progress' : 'survived'}
                  {failed ? `, year ${s.depletedAt}` : ''}
                </title>
              </rect>
              {failed && (
                <rect
                  x={padL + survEnd * cellW}
                  y={padT + i * rowH}
                  width={Math.max(2, cellW)}
                  height={rowH - 0.5}
                  fill={OUTCOME.depleted}
                >
                  <title>
                    Depleted at year {s.depletedAt} ({s.startYear + (s.depletedAt ?? 0)})
                  </title>
                </rect>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
