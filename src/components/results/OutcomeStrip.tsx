import type { ScenarioResult } from '../../engine/types';
import { OUTCOME } from '../colors';

type Props = {
  result: ScenarioResult;
  width?: number;
  selectedYears?: Set<number>;
  onToggle?: (year: number, e: React.MouseEvent) => void;
  onClear?: () => void;
};

/**
 * Barcode of outcomes by start year. One vertical mark per start year,
 * colored by outcome. Click a mark to toggle highlighting that start year
 * in the spaghetti chart above. Shift-click extends the selection to a
 * contiguous range.
 */
export function OutcomeStrip({
  result,
  width = 800,
  selectedYears,
  onToggle,
  onClear,
}: Props) {
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

  const ticks: number[] = [];
  const firstTick = Math.ceil(firstYear / 10) * 10;
  for (let y = firstTick; y <= lastYear; y += 10) ticks.push(y);

  const colorOf = (s: (typeof sims)[number]) => {
    if (!s.success && !s.inProgress) return OUTCOME.depleted;
    if (s.inProgress) return OUTCOME.inProgress;
    return OUTCOME.survived;
  };

  const hasSelection = !!selectedYears && selectedYears.size > 0;

  return (
    <div className="outcome-strip-wrap">
      <svg width={width} height={height} className="outcome-strip">
        <g transform={`translate(${margin.left},${margin.top})`}>
          <text x={-8} y={stripH / 2} dy="0.32em" textAnchor="end" fontSize={11} fill="#444">
            start year
          </text>
          {sims.map((s) => {
            const x = ((s.startYear - firstYear) / (span + 1)) * innerW;
            const isSelected = selectedYears?.has(s.startYear) ?? false;
            return (
              <g
                key={s.startYear}
                onClick={(e) => onToggle?.(s.startYear, e)}
                style={{ cursor: onToggle ? 'pointer' : 'default' }}
              >
                <rect
                  x={x}
                  y={0}
                  width={Math.max(1, colW - 0.5)}
                  height={stripH}
                  fill={colorOf(s)}
                  fillOpacity={hasSelection && !isSelected ? 0.3 : 1}
                />
                {isSelected && (
                  <rect
                    x={x - 0.5}
                    y={-1}
                    width={Math.max(2, colW + 0.5)}
                    height={stripH + 2}
                    fill="none"
                    stroke="#111"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                )}
                <title>
                  {s.startYear} — {!s.success && !s.inProgress
                    ? `depleted at year ${s.depletedAt}`
                    : s.inProgress
                      ? 'in-progress'
                      : 'survived'}
                  {onToggle ? ' (click to highlight)' : ''}
                </title>
              </g>
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
      {hasSelection && onClear && (
        <button className="strip-clear" onClick={onClear}>
          clear ({selectedYears!.size} selected)
        </button>
      )}
    </div>
  );
}

