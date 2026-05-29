import { interpolateRdYlGn } from 'd3-scale-chromatic';
import type { ScenarioResult } from '../../engine/types';
import { CHART } from '../colors';

type Props = {
  result: ScenarioResult;
  initialBalance: number;
  width?: number;
};

/**
 * rows = start year, cols = years into retirement, cell color = balance as
 * fraction of initial. Makes 1929 / 1966 / 2000 visually unmistakable as
 * dark horizontal bands per CLAUDE.md §6.
 */
export function CalendarHeatmap({ result, initialBalance, width = 800 }: Props) {
  const sims = [...result.sims].sort((a, b) => a.startYear - b.startYear);
  if (sims.length === 0) return null;
  const horizon = sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0);

  const padL = 56;
  const padT = 18;
  const cellW = Math.max(4, Math.min(14, (width - padL - 16) / horizon));
  const cellH = 8;
  const height = padT + sims.length * cellH + 16;

  const colorOf = (balance: number, depleted: boolean): string => {
    if (depleted) return CHART.ink;
    const ratio = balance / initialBalance;
    // Map 0..2x → red..yellow..green; clamp.
    const t = Math.max(0, Math.min(1, ratio / 2));
    return interpolateRdYlGn(t);
  };

  const yearLabels = sims
    .map((s, i) => ({ year: s.startYear, i }))
    .filter(({ year }) => year % 10 === 0);

  return (
    <div>
      <div className="text-sm text-text-secondary mb-2">
        Calendar heatmap — each row is a retirement start year. Color = balance
        as fraction of initial (red ≤ 0, yellow ≈ 1×, green ≥ 2×). Black =
        depleted.
      </div>
      <svg width={width} height={height} className="block">
        {yearLabels.map(({ year, i }) => (
          <text
            key={year}
            x={padL - 6}
            y={padT + i * cellH + cellH - 1}
            textAnchor="end"
            fontSize={10}
            fill={CHART.muted}
          >
            {year}
          </text>
        ))}
        {sims.map((s, i) =>
          s.trajectory.map((r) => (
            <rect
              key={`${s.startYear}-${r.t}`}
              x={padL + r.t * cellW}
              y={padT + i * cellH}
              width={cellW - 0.5}
              height={cellH - 0.5}
              fill={colorOf(r.balance, !!r.depleted)}
            >
              <title>
                {s.startYear} y{r.t}: ${Math.round(r.balance).toLocaleString()}
              </title>
            </rect>
          )),
        )}
      </svg>
    </div>
  );
}
