import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { ASSET } from '../colors';
import { AllocationRuleBuilder } from './AllocationRuleBuilder';
import { CustomScriptEditor } from './CustomScriptEditor';
import { GlidePath } from './GlidePath';

type Mode = 'fixed' | 'glide' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
};

function modeOf(a: AllocationStrategy): Mode {
  if (a.type === 'ruleBased') return 'rules';
  if (a.type === 'customSrc' || a.type === 'custom') return 'script';
  if (a.type === 'glidepath') return 'glide';
  return 'fixed';
}

function weightsOf(a: AllocationStrategy): Weights {
  if (a.type === 'static') return a.weights;
  if (a.type === 'glidepath') return a.start;
  return { stock: 0.6, bond: 0.4, cash: 0 };
}

const DEFAULT_SCRIPT = `// per-year allocation as { stock, bond, cash }
// state.t = year index, state.balance = current $
// Returns are normalized to 1.
return { stock: 0.6, bond: 0.4, cash: 0 };`;

export function AllocationEditor({ horizonYears, allocation, onChange }: Props) {
  const mode = modeOf(allocation);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    const current = weightsOf(allocation);
    if (m === 'fixed')
      onChange({ type: 'static', weights: current });
    if (m === 'glide')
      onChange({
        type: 'glidepath',
        start: current,
        end: { stock: Math.max(0, current.stock - 0.2), bond: Math.min(1, current.bond + 0.2), cash: current.cash },
        transitionYears: horizonYears,
      });
    if (m === 'rules')
      onChange({
        type: 'ruleBased',
        base: { stock: 0.6, bond: 0.4, cash: 0 },
        rules: [
          {
            if: { type: 'balanceVsInitial', ratio: 1, comparator: '<' },
            then: {
              type: 'shiftAllocation',
              delta: { stock: -0.1, bond: 0.1, cash: 0 },
            },
          },
        ],
      });
    if (m === 'script') onChange({ type: 'customSrc', src: DEFAULT_SCRIPT });
  };

  return (
    <div className="editor-block">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'fixed' && (
        <FixedAllocationEditor
          weights={allocation.type === 'static' ? allocation.weights : { stock: 0.6, bond: 0.4, cash: 0 }}
          onChange={(w) => onChange({ type: 'static', weights: w })}
        />
      )}
      {mode === 'glide' && (
        <GlidePath
          horizonYears={horizonYears}
          allocation={allocation}
          onChange={onChange}
        />
      )}
      {mode === 'rules' && allocation.type === 'ruleBased' && (
        <AllocationRuleBuilder
          base={allocation.base}
          rules={allocation.rules}
          onChange={(base, rules) =>
            onChange({ type: 'ruleBased', base, rules })
          }
        />
      )}
      {mode === 'script' && (
        <CustomScriptEditor
          label="Allocation script — return { stock, bond, cash }."
          signature="state"
          initial={
            allocation.type === 'customSrc' ? allocation.src : DEFAULT_SCRIPT
          }
          onChange={(src) => onChange({ type: 'customSrc', src })}
        />
      )}
    </div>
  );
}

function pixelsToWeights(bondTop: number, cashTop: number, innerH: number): Weights {
  const stockH = innerH - bondTop;
  const bondH = bondTop - cashTop;
  const cashH = cashTop;
  const total = stockH + bondH + cashH;
  if (total <= 0) return { stock: 1, bond: 0, cash: 0 };
  return { stock: stockH / total, bond: bondH / total, cash: cashH / total };
}

function weightsToPixels(w: Weights, innerH: number) {
  return {
    cashTop: w.cash * innerH,
    bondTop: (w.cash + w.bond) * innerH,
  };
}

function FixedAllocationEditor({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [local, setLocal] = useState<Weights>(weights);

  useEffect(() => {
    setLocal(weights);
  }, [weights]);

  const W = 280, H = 200;
  const margin = { top: 12, right: 40, bottom: 12, left: 12 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const barX = margin.left;
  const handleX = margin.left + innerW + 8;

  const { cashTop, bondTop } = weightsToPixels(local, innerH);

  const stockRegion = { y: margin.top + bondTop, h: innerH - bondTop };
  const bondRegion  = { y: margin.top + cashTop, h: bondTop - cashTop };
  const cashRegion  = { y: margin.top,           h: cashTop };

  const labelAt = (region: { y: number; h: number }, label: string) => {
    if (region.h < 14) return null;
    return (
      <text
        x={barX + innerW / 2}
        y={region.y + region.h / 2}
        dy="0.32em"
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="#fff"
        pointerEvents="none"
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 2 }}
      >
        {label}
      </text>
    );
  };

  useEffect(() => {
    const svg = select(svgRef.current);

    svg.selectAll<SVGCircleElement, 'bond' | 'cash'>('.fa-handle').call(
      drag<SVGCircleElement, 'bond' | 'cash'>().on('drag', function (event) {
        const key = (this as SVGCircleElement).dataset.key as 'bond' | 'cash';
        const yPx = Math.max(0, Math.min(innerH, event.y - margin.top));
        setLocal((prev) => {
          const { cashTop: ct, bondTop: bt } = weightsToPixels(prev, innerH);
          let newCashTop = ct;
          let newBondTop = bt;
          if (key === 'bond') {
            newBondTop = yPx;
            if (newBondTop < newCashTop) newCashTop = newBondTop;
          } else {
            newCashTop = yPx;
            if (newCashTop > newBondTop) newBondTop = newCashTop;
          }
          const next = pixelsToWeights(newBondTop, newCashTop, innerH);
          onChange(next);
          return next;
        });
      }),
    );
  }, [innerH, margin.top, onChange]);

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="control-group">
      <div className="control-label">Drag the band boundaries to set the allocation.</div>
      <svg ref={svgRef} width={W} height={H} className="curve-editor">
        {/* stock band */}
        <rect x={barX} y={stockRegion.y} width={innerW} height={stockRegion.h} fill={ASSET.stock} fillOpacity={0.85} />
        {/* bond band */}
        <rect x={barX} y={bondRegion.y} width={innerW} height={bondRegion.h} fill={ASSET.bond} fillOpacity={0.85} />
        {/* cash band */}
        <rect x={barX} y={cashRegion.y} width={innerW} height={cashRegion.h} fill={ASSET.cash} fillOpacity={0.85} />

        {labelAt(stockRegion, pct(local.stock))}
        {labelAt(bondRegion,  pct(local.bond))}
        {labelAt(cashRegion,  pct(local.cash))}

        {/* bond/stock boundary handle */}
        <circle
          className="fa-handle"
          data-key="bond"
          cx={handleX}
          cy={margin.top + bondTop}
          r={6}
          fill="#fff"
          stroke="#222"
          strokeWidth={2}
          cursor="ns-resize"
        />
        {/* cash/bond boundary handle (only visible when cash > 0) */}
        {local.cash > 0.001 && (
          <circle
            className="fa-handle"
            data-key="cash"
            cx={handleX}
            cy={margin.top + cashTop}
            r={6}
            fill="#fff"
            stroke="#222"
            strokeWidth={2}
            cursor="ns-resize"
          />
        )}
      </svg>
      <div className="legend">
        <span><span className="sw" style={{ background: ASSET.stock }} /> stocks</span>
        <span><span className="sw" style={{ background: ASSET.bond }} /> bonds</span>
        <span><span className="sw" style={{ background: ASSET.cash }} /> cash</span>
      </div>
    </div>
  );
}

function ModeToggle({
  current,
  onChange,
}: {
  current: Mode;
  onChange: (m: Mode) => void;
}) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'fixed', label: 'fixed' },
    { k: 'glide', label: 'glide' },
    { k: 'rules', label: 'rules' },
    { k: 'script', label: 'script' },
  ];
  return (
    <div className="mode-toggle">
      {modes.map((m) => (
        <button
          key={m.k}
          className={current === m.k ? 'active' : ''}
          onClick={() => onChange(m.k)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
