import {
  axisLabel,
  formatAxisValue,
  type Axis,
} from '../../store/sweepStore';
import type { SweepGrid } from '../../engine/sweepRunner';
import { SpaghettiChart } from './SpaghettiChart';

export function SmallMultiples({ grid }: { grid: SweepGrid }) {
  if (grid.axes.length !== 1) return null;
  const axis: Axis = grid.axes[0];
  return (
    <div>
      <div className="heatmap-meta">
        Small multiples across <strong>{axisLabel(axis)}</strong>.
      </div>
      <div className="multiples-grid">
        {grid.cells.map((cell, i) => {
          const v = cell.axisValues[axis]!;
          return (
            <div key={i} className="multiple">
              <div className="multiple-title">
                {axisLabel(axis)} {formatAxisValue(axis, v)} —{' '}
                {Number.isFinite(cell.result.successRate)
                  ? `${(cell.result.successRate * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <SpaghettiChart result={cell.result} width={300} height={160} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
