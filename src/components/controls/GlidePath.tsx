import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
  width?: number;
  height?: number;
};

const COLORS = { stock: '#2c5282', bond: '#6b8e6b', cash: '#b08e3a' };

type Endpoints = { start: Weights; end: Weights };

function allocToEndpoints(a: AllocationStrategy): Endpoints {
  if (a.type === 'static') return { start: a.weights, end: a.weights };
  if (a.type === 'glidepath') return { start: a.start, end: a.end };
  // Other strategy types collapse to a flat 60/40 visual; the editor will
  // overwrite when the user drags.
  return {
    start: { stock: 0.6, bond: 0.4, cash: 0 },
    end: { stock: 0.6, bond: 0.4, cash: 0 },
  };
}

function endpointsToAllocation(
  ep: Endpoints,
  horizonYears: number,
): AllocationStrategy {
  const same =
    ep.start.stock === ep.end.stock &&
    ep.start.bond === ep.end.bond &&
    ep.start.cash === ep.end.cash;
  if (same) return { type: 'static', weights: ep.start };
  return {
    type: 'glidepath',
    start: ep.start,
    end: ep.end,
    transitionYears: horizonYears,
  };
}

/**
 * Convert a y-pixel boundary in the stack to a (stock, bond, cash) triple.
 * Stocks sit on the bottom, bonds in the middle, cash on top — bondTop and
 * cashTop are the two y boundaries (cashTop ≤ bondTop ≤ innerH). Returns
 * fractions normalized to 1.
 */
function pixelsToWeights(
  bondTop: number,
  cashTop: number,
  innerH: number,
): Weights {
  const stockH = innerH - bondTop;
  const bondH = bondTop - cashTop;
  const cashH = cashTop;
  const total = stockH + bondH + cashH;
  if (total <= 0) return { stock: 1, bond: 0, cash: 0 };
  return { stock: stockH / total, bond: bondH / total, cash: cashH / total };
}

export function GlidePath({
  horizonYears,
  allocation,
  onChange,
  width = 280,
  height = 200,
}: Props) {
  const [ep, setEp] = useState<Endpoints>(() => allocToEndpoints(allocation));
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setEp(allocToEndpoints(allocation));
  }, [allocation]);

  const margin = { top: 12, right: 12, bottom: 24, left: 12 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const x = scaleLinear().domain([0, 1]).range([0, innerW]);

  // y boundaries for each endpoint. Cash is on top, bond in middle, stock on bottom.
  const yBound = (w: Weights) => {
    const cashTop = w.cash * innerH; // top of cash band starts here
    const bondTop = (w.cash + w.bond) * innerH; // top of bond
    return { cashTop, bondTop };
  };
  const startY = yBound(ep.start);
  const endY = yBound(ep.end);

  // Build the four polygon paths for stock/bond/cash bands across the chart.
  const bandPath = (
    sStartY: number,
    sEndY: number,
    eStartY: number,
    eEndY: number,
  ) => {
    const x0 = margin.left + x(0);
    const x1 = margin.left + x(1);
    return `M${x0},${margin.top + sStartY} L${x1},${margin.top + eStartY} L${x1},${margin.top + eEndY} L${x0},${margin.top + sEndY} Z`;
  };

  const stockBand = bandPath(startY.bondTop, innerH, endY.bondTop, innerH);
  const bondBand = bandPath(
    startY.cashTop,
    startY.bondTop,
    endY.cashTop,
    endY.bondTop,
  );
  const cashBand = bandPath(0, startY.cashTop, 0, endY.cashTop);

  type HandleKey = 'startBondTop' | 'startCashTop' | 'endBondTop' | 'endCashTop';
  const handlePos: Record<HandleKey, { cx: number; cy: number }> = {
    startBondTop: { cx: margin.left + x(0), cy: margin.top + startY.bondTop },
    startCashTop: { cx: margin.left + x(0), cy: margin.top + startY.cashTop },
    endBondTop: { cx: margin.left + x(1), cy: margin.top + endY.bondTop },
    endCashTop: { cx: margin.left + x(1), cy: margin.top + endY.cashTop },
  };

  useEffect(() => {
    const svg = select(svgRef.current);
    svg
      .selectAll<SVGCircleElement, HandleKey>('.gp-handle')
      .call(
        drag<SVGCircleElement, HandleKey>().on('drag', function (event) {
          const key = (this as SVGCircleElement).dataset.key as HandleKey;
          const yPx = Math.max(0, Math.min(innerH, event.y - margin.top));
          setEp((prev) => {
            const next: Endpoints = {
              start: { ...prev.start },
              end: { ...prev.end },
            };
            const which = key.startsWith('start') ? 'start' : 'end';
            const yb = yBound(next[which]);
            let cashTop = yb.cashTop;
            let bondTop = yb.bondTop;
            if (key.endsWith('BondTop')) {
              bondTop = Math.max(cashTop, yPx);
            } else {
              cashTop = Math.min(bondTop, yPx);
            }
            next[which] = pixelsToWeights(bondTop, cashTop, innerH);
            const nextAlloc = endpointsToAllocation(next, horizonYears);
            onChange(nextAlloc);
            return next;
          });
        }),
      );
  }, [horizonYears, onChange, innerH, margin.top]);

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="control-group">
      <div className="control-label">
        Glide path — drag the band boundaries at year 0 (left) and year{' '}
        {horizonYears} (right).
      </div>
      <svg ref={svgRef} width={width} height={height} className="curve-editor">
        <path d={stockBand} fill={COLORS.stock} fillOpacity={0.85} />
        <path d={bondBand} fill={COLORS.bond} fillOpacity={0.85} />
        <path d={cashBand} fill={COLORS.cash} fillOpacity={0.85} />
        {(Object.keys(handlePos) as HandleKey[]).map((k) => (
          <circle
            key={k}
            className="gp-handle"
            data-key={k}
            cx={handlePos[k].cx}
            cy={handlePos[k].cy}
            r={6}
            fill="#fff"
            stroke="#222"
            strokeWidth={2}
            cursor="ns-resize"
          />
        ))}
        <text x={margin.left} y={height - 6} fontSize={10} fill="#888">
          year 0: {pct(ep.start.stock)}/{pct(ep.start.bond)}/{pct(ep.start.cash)}
        </text>
        <text
          x={width - margin.right}
          y={height - 6}
          textAnchor="end"
          fontSize={10}
          fill="#888"
        >
          year {horizonYears}: {pct(ep.end.stock)}/{pct(ep.end.bond)}/
          {pct(ep.end.cash)}
        </text>
      </svg>
      <div className="legend">
        <span><span className="sw" style={{ background: COLORS.stock }} /> stocks</span>
        <span><span className="sw" style={{ background: COLORS.bond }} /> bonds</span>
        <span><span className="sw" style={{ background: COLORS.cash }} /> cash</span>
      </div>
    </div>
  );
}
