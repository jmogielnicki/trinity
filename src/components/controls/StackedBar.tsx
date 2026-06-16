import { useRef, useState, useEffect, useCallback } from 'react';
import type { Weights } from '../../engine/types';
import { ASSET, CHART } from '../colors';
import { useElementWidth } from './useElementWidth';

type Props = {
  /** One entry = single fixed bar. Two entries = glide-path (left + right columns). */
  weights: Weights[];
  /** X-axis labels drawn inside the SVG, one per column. */
  columnLabels?: string[];
  onChange: (weights: Weights[]) => void;
  /** Optional fixed width; omit to fill (and track) the container. */
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

export function StackedBar({
  weights,
  columnLabels,
  onChange,
  width: widthProp,
  height = 200,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [wrapRef, measuredW] = useElementWidth(280);
  const width = widthProp ?? measuredW;
  const [local, setLocal] = useState<Weights[]>(weights);

  // Track active drag: which column + which boundary
  const activeDrag = useRef<{ ci: number; boundary: 'bondTop' | 'cashTop' } | null>(null);

  // Keep a ref to layout values so drag handlers always read fresh values
  // without needing to be recreated on every render.
  const layoutRef = useRef({ innerH: 0, marginTop: 0 });

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

  layoutRef.current = { innerH, marginTop: margin.top };

  const colX = n === 1
    ? [margin.left]
    : [margin.left, margin.left + innerW];

  const handleX = (i: number) => n === 1 ? margin.left + innerW + 8 : colX[i];

  const pixels = local.map(w => weightsToPixels(w, innerH));
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  // --- Pointer-event drag handlers ---
  // Using setPointerCapture means pointermove/pointerup always fire on the
  // handle element even when the pointer moves far away — works identically
  // for mouse and touch with no browser-specific quirks.

  const startDrag = useCallback((
    e: React.PointerEvent<SVGGElement>,
    ci: number,
    boundary: 'bondTop' | 'cashTop',
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activeDrag.current = { ci, boundary };
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!activeDrag.current || !svgRef.current) return;
    const { innerH: h, marginTop: mt } = layoutRef.current;
    const rect = svgRef.current.getBoundingClientRect();
    const rawY = Math.max(0, Math.min(h, e.clientY - rect.top - mt));
    // Snap to 5% increments of the bar height (matches the fixed controller).
    const yPx = Math.round(rawY / (h * 0.05)) * (h * 0.05);
    const { ci, boundary } = activeDrag.current;

    setLocal(prev => {
      const next = prev.map(w => ({ ...w }));
      const { cashTop: ct, bondTop: bt } = weightsToPixels(prev[ci], h);
      let newCashTop = ct, newBondTop = bt;
      if (boundary === 'bondTop') {
        newBondTop = yPx;
        if (newBondTop < newCashTop) newCashTop = newBondTop;
      } else {
        newCashTop = yPx;
        if (newCashTop > newBondTop) newBondTop = newCashTop;
      }
      next[ci] = pixelsToWeights(newBondTop, newCashTop, h);
      onChange(next);
      return next;
    });
  }, [onChange]);

  const endDrag = useCallback(() => { activeDrag.current = null; }, []);

  // --- Band rendering ---

  const bandPath = (y0a: number, y0b: number, y1a: number, y1b: number) =>
    `M${colX[0]},${margin.top + y0a} L${colX[1]},${margin.top + y1a} L${colX[1]},${margin.top + y1b} L${colX[0]},${margin.top + y0b} Z`;

  const renderBands = () => {
    if (n === 1) {
      const { cashTop, bondTop } = pixels[0];
      return (
        <>
          <rect x={colX[0]} y={margin.top}           width={innerW} height={cashTop}           fill={ASSET.cash}  fillOpacity={0.85} />
          <rect x={colX[0]} y={margin.top + cashTop} width={innerW} height={bondTop - cashTop} fill={ASSET.bond}  fillOpacity={0.85} />
          <rect x={colX[0]} y={margin.top + bondTop} width={innerW} height={innerH - bondTop}  fill={ASSET.stock} fillOpacity={0.85} />
        </>
      );
    }
    const p0 = pixels[0], p1 = pixels[1];
    return (
      <>
        <path d={bandPath(0,          p0.cashTop, 0,          p1.cashTop)} fill={ASSET.cash}  fillOpacity={0.85} />
        <path d={bandPath(p0.cashTop, p0.bondTop, p1.cashTop, p1.bondTop)} fill={ASSET.bond}  fillOpacity={0.85} />
        <path d={bandPath(p0.bondTop, innerH,     p1.bondTop, innerH)}     fill={ASSET.stock} fillOpacity={0.85} />
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
    const cx = n === 1
      ? margin.left + innerW / 2
      : i === 0
        ? margin.left + innerW * 0.18
        : margin.left + innerW * 0.82;

    const label = (yTop: number, yBot: number, text: string, key: string) => {
      const h = yBot - yTop;
      if (h < 14) return null;
      return (
        <text key={key} x={cx} y={margin.top + (yTop + yBot) / 2} dy="0.32em"
          textAnchor="middle" fontSize={n === 1 ? 12 : 11} fontWeight={n === 1 ? 600 : 500}
          fill={CHART.surface} pointerEvents="none" style={labelStyle}
        >
          {text}
        </text>
      );
    };

    return [
      label(0,       cashTop, pct(w.cash),  `${i}-cash`),
      label(cashTop, bondTop, pct(w.bond),  `${i}-bond`),
      label(bondTop, innerH,  pct(w.stock), `${i}-stock`),
    ];
  });

  // --- Handle rendering ---

  const handleProps = (ci: number, boundary: 'bondTop' | 'cashTop') => ({
    onPointerDown: (e: React.PointerEvent<SVGGElement>) => startDrag(e, ci, boundary),
    onPointerMove: onDragMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    style: { touchAction: 'none' as const, cursor: 'ns-resize' },
  });

  const renderHandles = () => local.flatMap((_w, i) => {
    const { cashTop, bondTop } = pixels[i];
    const hx = handleX(i);
    return [
      <g key={`col${i}_bondTop`} {...handleProps(i, 'bondTop')}>
        <circle cx={hx} cy={margin.top + bondTop} r={8} fill={CHART.surface} stroke={CHART.ink} strokeWidth={2} />
      </g>,
      <g key={`col${i}_cashTop`} {...handleProps(i, 'cashTop')}>
        <circle cx={hx} cy={margin.top + cashTop} r={8} fill={CHART.surface} stroke={CHART.ink} strokeWidth={2} />
      </g>,
    ];
  });

  // --- Column axis labels ---

  const renderColumnLabels = () => columnLabels?.map((label, i) => (
    <text key={`col-label-${i}`} x={n === 1 ? colX[0] : colX[i]} y={height - 6}
      textAnchor={i === 0 ? 'start' : 'end'} fontSize={10} fill={CHART.faint}
    >
      {label}
    </text>
  ));

  return (
    <div ref={wrapRef} className="w-full">
      <svg ref={svgRef} width={width} height={height} className="block touch-none select-none">
        {renderBands()}
        {renderLabels()}
        {renderHandles()}
        {renderColumnLabels()}
      </svg>
    </div>
  );
}
