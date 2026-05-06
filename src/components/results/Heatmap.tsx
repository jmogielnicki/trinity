import { useMemo, useState } from 'react';
import { interpolateRdYlGn } from 'd3-scale-chromatic';
import { axisLabel, formatAxisValue } from '../../store/sweepStore';
import type { GridCell, SweepGrid } from '../../engine/sweepRunner';
import { SpaghettiChart } from './SpaghettiChart';

type Props = {
  grid: SweepGrid;
};

export function Heatmap({ grid }: Props) {
  const [drill, setDrill] = useState<GridCell | null>(null);
  if (grid.axes.length !== 2) return null;
  const [aRow, aCol] = grid.axes;
  const rows = grid.values[aRow];
  const cols = grid.values[aCol];

  const lookup = useMemo(() => {
    const map = new Map<string, GridCell>();
    for (const c of grid.cells) {
      map.set(`${c.axisValues[aRow]}|${c.axisValues[aCol]}`, c);
    }
    return map;
  }, [grid.cells, aRow, aCol]);

  const cellW = 56;
  const cellH = 36;
  const padL = 88;
  const padT = 32;

  const colorOf = (rate: number): string =>
    Number.isFinite(rate) ? interpolateRdYlGn(rate) : '#ddd';

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-meta">
        <strong>{axisLabel(aRow)}</strong> (rows) ×{' '}
        <strong>{axisLabel(aCol)}</strong> (cols). Color = success rate. Click a
        cell to drill into its spaghetti view.
      </div>
      <svg
        width={padL + cols.length * cellW + 16}
        height={padT + rows.length * cellH + 16}
        className="heatmap"
      >
        {cols.map((c, i) => (
          <text
            key={`ch-${i}`}
            x={padL + i * cellW + cellW / 2}
            y={padT - 8}
            textAnchor="middle"
            fontSize={11}
            fill="#444"
          >
            {formatAxisValue(aCol, c)}
          </text>
        ))}
        {rows.map((r, i) => (
          <text
            key={`rh-${i}`}
            x={padL - 8}
            y={padT + i * cellH + cellH / 2}
            dy="0.32em"
            textAnchor="end"
            fontSize={11}
            fill="#444"
          >
            {formatAxisValue(aRow, r)}
          </text>
        ))}
        {rows.flatMap((r, i) =>
          cols.map((c, j) => {
            const cell = lookup.get(`${r}|${c}`);
            const rate = cell?.result.successRate ?? NaN;
            return (
              <g
                key={`${i}-${j}`}
                onClick={() => cell && setDrill(cell)}
                style={{ cursor: cell ? 'pointer' : 'default' }}
              >
                <rect
                  x={padL + j * cellW}
                  y={padT + i * cellH}
                  width={cellW - 2}
                  height={cellH - 2}
                  fill={colorOf(rate)}
                />
                <text
                  x={padL + j * cellW + cellW / 2}
                  y={padT + i * cellH + cellH / 2}
                  dy="0.32em"
                  textAnchor="middle"
                  fontSize={10}
                  fill={rate > 0.5 ? '#222' : '#fff'}
                >
                  {Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : '—'}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      {drill && (
        <div className="drill">
          <button className="close" onClick={() => setDrill(null)}>
            close
          </button>
          <h4>
            {axisLabel(aRow)} = {formatAxisValue(aRow, drill.axisValues[aRow]!)},{' '}
            {axisLabel(aCol)} = {formatAxisValue(aCol, drill.axisValues[aCol]!)}{' '}
            — success {(drill.result.successRate * 100).toFixed(1)}%
          </h4>
          <SpaghettiChart result={drill.result} width={720} height={320} />
        </div>
      )}
    </div>
  );
}

