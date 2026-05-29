import { useRef, useState, useEffect, useCallback } from 'react';
import type { Weights } from '../../engine/types';
import { ASSET } from '../colors';

type Props = {
  weights: Weights;
  onChange: (w: Weights) => void;
  height?: number;
};

const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const SLEEVES: { key: keyof Weights; label: string }[] = [
  { key: 'stock', label: 'Stocks' },
  { key: 'bond', label: 'Bonds' },
  { key: 'cash', label: 'Cash' },
];

/**
 * Fixed-allocation controller (prototype "AllocationBar"): a horizontal bar —
 * stocks | bonds | cash, left→right — with two draggable white handles on the
 * internal boundaries, and a legend below showing the live percentages.
 *
 * Boundary 1 trades stock↔bond (cash held); boundary 2 trades bond↔cash (stock
 * held). Values snap to 5%. Separate from StackedBar (which the glide-path
 * editor still uses in its vertical 2-column form).
 */
export function FixedAllocationBar({ weights, onChange, height = 44 }: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<null | 'stockBond' | 'bondCash'>(null);

  const b1 = weights.stock; // stock | bond boundary (fraction from left)
  const b2 = weights.stock + weights.bond; // bond | cash boundary

  const applyFromX = useCallback(
    (which: 'stockBond' | 'bondCash', clientX: number) => {
      const el = barRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const frac = clamp01((clientX - r.left) / r.width);
      if (which === 'stockBond') {
        const maxB = 1 - weights.cash; // can't cross the cash boundary
        const stock = Math.max(0, Math.min(maxB, snap(frac)));
        onChange({ stock, bond: maxB - stock, cash: weights.cash });
      } else {
        const nb2 = Math.max(weights.stock, Math.min(1, snap(frac)));
        onChange({ stock: weights.stock, bond: nb2 - weights.stock, cash: 1 - nb2 });
      }
    },
    [onChange, weights.stock, weights.cash],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => applyFromX(drag, e.clientX);
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, applyFromX]);

  const Handle = ({ left, which }: { left: number; which: 'stockBond' | 'bondCash' }) => (
    <button
      type="button"
      aria-label="Drag to adjust allocation"
      onPointerDown={(e) => {
        e.preventDefault();
        setDrag(which);
      }}
      className="absolute top-1/2 z-10 cursor-ew-resize touch-none p-0"
      style={{
        left: `${left * 100}%`,
        width: 16,
        height: 16,
        transform: 'translate(-50%, -50%)',
        borderRadius: 999,
        background: 'var(--color-surface)',
        border: '2px solid var(--color-text)',
        boxShadow: 'var(--shadow-card)',
      }}
    />
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={barRef}
        className="relative w-full select-none"
        style={{ height }}
      >
        <div className="absolute inset-0 flex overflow-hidden" style={{ borderRadius: 'var(--radius-md)' }}>
          <div style={{ width: `${weights.stock * 100}%`, background: ASSET.stock }} />
          <div style={{ width: `${weights.bond * 100}%`, background: ASSET.bond }} />
          <div style={{ width: `${weights.cash * 100}%`, background: ASSET.cash }} />
        </div>
        {b1 > 0.001 && b1 < 0.999 && <Handle left={b1} which="stockBond" />}
        {b2 > 0.001 && b2 < 0.999 && <Handle left={b2} which="bondCash" />}
      </div>
      <div className="flex justify-between">
        {SLEEVES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block flex-shrink-0"
              style={{ width: 10, height: 10, borderRadius: 3, background: ASSET[s.key] }}
            />
            <span className="text-sm text-text-muted">
              {s.label} <b className="text-text num">{fmtPct(weights[s.key])}</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
