import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  width?: number;
};

/**
 * Barcode of outcomes by start year. One vertical mark per start year,
 * colored by outcome. Sits under the spaghetti chart so you can see at a
 * glance which retirement starts were bad.
 */
export function OutcomeStrip({ result, width = 800 }: Props) {
  const sims = [...result.sims].sort((a, b) => a.startYear - b.startYear);
  if (sims.length === 0) return null;

  const margin = { left: 64, right: 16, top: 6, bottom: 22 };
  const innerW = width - margin.left - margin.right;
  const stripH = 24;
  const height = stripH + margin.top + margin.bottom;

  const firstYear = sims[0].startYear;
  const lastYear = sims[sims.length - 1].startYear;
  const span = Math.max(1, lastYear - firstYear);
  const colW = innerW / (span + 1);

  // Decade tick labels
  const ticks: number[] = [];
  const firstTick = Math.ceil(firstYear / 10) * 10;
  for (let y = firstTick; y <= lastYear; y += 10) ticks.push(y);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  return (
    <svg width={width} height={height} className="outcome-strip">
      <g transform={`translate(${margin.left},${margin.top})`}>
        <text x={-8} y={stripH / 2} dy="0.32em" textAnchor="end" fontSize={11} fill="#444">
          start year
        </text>
        {sims.map((s) => {
          const x = ((s.startYear - firstYear) / (span + 1)) * innerW;
          return (
            <rect
              key={s.startYear}
              x={x}
              y={0}
              width={Math.max(1, colW - 0.5)}
              height={stripH}
              fill={colorOf(s)}
            >
              <title>
                {s.startYear} — {!s.success && !s.inProgress
                  ? `depleted at year ${s.depletedAt}`
                  : s.inProgress
                    ? 'in-progress'
                    : 'survived'}
              </title>
            </rect>
          );
        })}
        {ticks.map((y) => (
          <g key={y} transform={`translate(${((y - firstYear) / (span + 1)) * innerW},${stripH})`}>
            <line y1={0} y2={4} stroke="#888" />
            <text y={16} textAnchor="middle" fontSize={10} fill="#666">
              {y}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
