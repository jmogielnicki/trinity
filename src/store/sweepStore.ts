import { create } from 'zustand';

/**
 * Three axes the user can pin or sweep. Each maps to a parameter the engine
 * consumes; when an axis is in 'sweep' mode the editor for that dimension
 * doesn't drive the run — the swept values do.
 */
export type Axis = 'withdrawalRate' | 'stockPct' | 'horizon';

export type AxisMode =
  | { mode: 'pin' }
  | { mode: 'sweep'; from: number; to: number; step: number };

export type SweepState = {
  axes: Record<Axis, AxisMode>;
  setAxis: (axis: Axis, m: AxisMode) => void;
  pinAll: () => void;
};

const DEFAULTS: Record<Axis, AxisMode> = {
  withdrawalRate: { mode: 'pin' },
  stockPct: { mode: 'pin' },
  horizon: { mode: 'pin' },
};

export const useSweepStore = create<SweepState>((set) => ({
  axes: DEFAULTS,
  setAxis: (axis, m) =>
    set((s) => {
      const next = { ...s.axes, [axis]: m };
      // Cap at 2 sweeping axes — UI past 2D is unreadable per CLAUDE.md §6.
      const sweeping = (Object.values(next) as AxisMode[]).filter(
        (a) => a.mode === 'sweep',
      ).length;
      if (sweeping > 2) return s;
      return { axes: next };
    }),
  pinAll: () => set({ axes: DEFAULTS }),
}));

export function axisValues(m: AxisMode): number[] {
  if (m.mode === 'pin') return [];
  const out: number[] = [];
  // Use integer-multiple loop to avoid float drift.
  const n = Math.round((m.to - m.from) / m.step);
  for (let i = 0; i <= n; i++) {
    out.push(+(m.from + i * m.step).toFixed(6));
  }
  return out;
}

export function sweepingAxes(state: SweepState): Axis[] {
  return (Object.keys(state.axes) as Axis[]).filter(
    (a) => state.axes[a].mode === 'sweep',
  );
}

/** Axis defaults when the user first toggles to sweep mode. */
export const DEFAULT_RANGES: Record<Axis, { from: number; to: number; step: number }> = {
  withdrawalRate: { from: 0.03, to: 0.06, step: 0.0025 },
  stockPct: { from: 0.4, to: 1.0, step: 0.1 },
  horizon: { from: 20, to: 40, step: 5 },
};

export function axisLabel(a: Axis): string {
  return {
    withdrawalRate: 'Withdrawal rate',
    stockPct: 'Stock %',
    horizon: 'Horizon',
  }[a];
}

export function formatAxisValue(a: Axis, v: number): string {
  if (a === 'withdrawalRate' || a === 'stockPct') return `${(v * 100).toFixed(a === 'withdrawalRate' ? 2 : 0)}%`;
  return `${v}y`;
}
