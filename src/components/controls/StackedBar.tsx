import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import type { Weights } from '../../engine/types';
import { ASSET } from '../colors';

type Props = {
  /** One entry = single fixed bar. Two entries = glide-path (left + right columns). */
  weights: Weights[];
  /** X-axis labels drawn inside the SVG, one per column. */
  columnLabels?: string[];
  onChange: (weights: Weights[]) => void;
  width?: number;
  height?: number;
};

export function pixelsToWeights(bondTop: number, cashTop: number, innerH: number): Weights {
  const stockH = innerH - bondTop;
  const bondH = bondTop - cashTop;
  const cashH = cashTop;
  const total = stockH + bondH + cashH;
  if (total <= 0) return { stock: 1, bond: 0, cash: 0 };
  return { stock: stockH / total, bond: bondH / total, cash: cashH / total };
}

export function weightsToPixels(w: Weights, innerH: number) {
  return {
    cashTop: w.cash * innerH,
    bondTop: (w.cash + w.bond) * innerH,
  };
}

type HandleKey = `col${number}_${'bondTop' | 'cashTop'}`;

export function StackedBar({
  weights,
  columnLabels,
  onChange,
  width = 280,
  height = 200,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [local, setLocal] = useState<Weights[]>(weights);

  useEffect(() => { setLocal(weights); }, [weights]);

  const n = local.length;
  const hasLabels = columnLabels && columnLabels.length > 0;
  const margin = {
    top: 12,
    right: n === 1 ? 40 : 12,
    bottom: hasLabels ? 24 : 12,
    left: 12,
  };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // X position of each column (left edge of bar for n=1, or band endpoint for n=2)
  const colX = n === 1
    ? [margin.left]
    : [margin.left, margin.left + innerW];

  // Handles sit just outside the bar for single-column, at column edges for two-column
  const handleX = (i: number) => n === 1 ? margin.left + innerW + 8 : colX[i];

  const pixels = local.map(w => weightsToPixels(w, innerH));
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  // --- Band rendering ---

  const bandPath = (y0a: number, y0b: number, y1a: number, y1b: number) =>
    `M${colX[0]},${margin.top + y0a} L${colX[1]},${margin.top + y1a} L${colX[1]},${margin.top + y1b} L${colX[0]},${margin.top + y0b} Z`;

  const renderBands = () => {
    if (n === 1) {
      const { cashTop, bondTop } = pixels[0];
      return (
        <>
          <rect x={colX[0]} y={margin.top}             width={innerW} height={cashTop}           fill={ASSET.cash}  fillOpacity={0.85} />
          <rect x={colX[0]} y={margin.top + cashTop}   width={innerW} height={bondTop - cashTop} fill={ASSET.bond}  fillOpacity={0.85} />
          <rect x={colX[0]} y={margin.top + bondTop}   width={innerW} height={innerH - bondTop}  fill={ASSET.stock} fillOpacity={0.85} />
        </>
      );
    }
    const p0 = pixels[0], p1 = pixels[1];
    return (
      <>
        <path d={bandPath(0,           p0.cashTop, 0,           p1.cashTop)} fill={ASSET.cash}  fillOpacity={0.85} />
        <path d={bandPath(p0.cashTop,  p0.bondTop, p1.cashTop,  p1.bondTop)} fill={ASSET.bond}  fillOpacity={0.85} />
        <path d={bandPath(p0.bondTop,  innerH,     p1.bondTop,  innerH)}     fill={ASSET.stock} fillOpacity={0.85} />
      </>
    );
  };

  // --- Label rendering ---

  const labelStyle: React.CSSProperties = {
    paintOrder: 'stroke',
    stroke: 'rgba(0,0,0,0.25)',
    strokeWidth: 2,
  };

  const renderLabels = () => local.flatMap((w, i) => {
    const { cashTop, bondTop } = pixels[i];
    // Centered in bar for single-column; offset 18% from each edge for two-column
    const cx = n === 1
      ? margin.left + innerW / 2
      : i === 0
        ? margin.left + innerW * 0.18
        : margin.left + innerW * 0.82;

    const label = (yTop: number, yBot: number, text: string, key: string) => {
      const h = yBot - yTop;
      if (h < 14) return null;
      return (
        <text
          key={key}
          x={cx}
          y={margin.top + (yTop + yBot) / 2}
          dy="0.32em"
          textAnchor="middle"
          fontSize={n === 1 ? 12 : 11}
          fontWeight={n === 1 ? 600 : 500}
          fill="#fff"
          pointerEvents="none"
          style={labelStyle}
        >
          {text}
        </text>
      );
    };

    return [
      label(0,        cashTop,  pct(w.cash),  `${i}-cash`),
      label(cashTop,  bondTop,  pct(w.bond),  `${i}-bond`),
      label(bondTop,  innerH,   pct(w.stock), `${i}-stock`),
    ];
  });

  // --- Drag handles ---

  useEffect(() => {
    const svg = select(svgRef.current);
    svg.selectAll<SVGGElement, HandleKey>('.sb-handle').call(
      drag<SVGGElement, HandleKey>().on('drag', function (event) {
        const key = (this as SVGGElement).dataset.key as HandleKey;
        const [colPart, boundary] = key.split('_');
        const ci = parseInt(colPart.replace('col', ''));
        const yPx = Math.max(0, Math.min(innerH, event.y - margin.top));

        setLocal(prev => {
          const next = prev.map(w => ({ ...w }));
          const { cashTop: ct, bondTop: bt } = weightsToPixels(prev[ci], innerH);
          let newCashTop = ct, newBondTop = bt;
          if (boundary === 'bondTop') {
            newBondTop = yPx;
            if (newBondTop < newCashTop) newCashTop = newBondTop;
          } else {
            newCashTop = yPx;
            if (newCashTop > newBondTop) newBondTop = newCashTop;
          }
          next[ci] = pixelsToWeights(newBondTop, newCashTop, innerH);
          onChange(next);
          return next;
        });
      }),
    );
  }, [innerH, margin.top, onChange]);

  const handleStyle: React.CSSProperties = { touchAction: 'none', cursor: 'ns-resize' };

  const renderHandles = () => local.flatMap((_w, i) => {
    const { cashTop, bondTop } = pixels[i];
    const hx = handleX(i);
    return [
      <g key={`col${i}_bondTop`} className="sb-handle" data-key={`col${i}_bondTop`} style={handleStyle}>
        <circle cx={hx} cy={margin.top + bondTop} r={18} fill="transparent" />
        <circle cx={hx} cy={margin.top + bondTop} r={6} fill="#fff" stroke="#222" strokeWidth={2} />
      </g>,
      <g key={`col${i}_cashTop`} className="sb-handle" data-key={`col${i}_cashTop`} style={handleStyle}>
        <circle cx={hx} cy={margin.top + cashTop} r={18} fill="transparent" />
        <circle cx={hx} cy={margin.top + cashTop} r={6} fill="#fff" stroke="#222" strokeWidth={2} />
      </g>,
    ];
  });

  // --- Column axis labels ---

  const renderColumnLabels = () => columnLabels?.map((label, i) => (
    <text
      key={`col-label-${i}`}
      x={n === 1 ? colX[0] : colX[i]}
      y={height - 6}
      textAnchor={i === 0 ? 'start' : 'end'}
      fontSize={10}
      fill="#888"
    >
      {label}
    </text>
  ));

  return (
    <svg ref={svgRef} width={width} height={height} className="curve-editor">
      {renderBands()}
      {renderLabels()}
      {renderHandles()}
      {renderColumnLabels()}
    </svg>
  );
}
