import { create } from 'zustand';
import { runSweep, type SweepGrid } from '../engine/sweepRunner';
import { runScenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import type { ScenarioState } from './scenarioStore';
import type { SweepState } from './sweepStore';

export type ResultsState = {
  data: HistoricalSeries | null;
  result: ScenarioResult | null;
  grid: SweepGrid | null;
  computeMs: number;
  setData: (d: HistoricalSeries) => void;
  recompute: (scenario: ScenarioState, sweep: SweepState) => void;
};

export const useResultsStore = create<ResultsState>((set, get) => ({
  data: null,
  result: null,
  grid: null,
  computeMs: 0,
  setData: (data) => set({ data }),
  recompute: (scenario, sweep) => {
    const { data } = get();
    if (!data) return;
    // Phase 4: still synchronous. Worker pool deferred — see FOLLOWUPS.md.
    const t0 = performance.now();
    const base = {
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: scenario.allocation,
      withdrawal: scenario.withdrawal,
    };
    const sweeping = (Object.keys(sweep.axes) as Array<keyof typeof sweep.axes>).filter(
      (a) => sweep.axes[a].mode === 'sweep',
    );
    if (sweeping.length === 0) {
      const result = runScenario(base, data);
      set({ result, grid: null, computeMs: performance.now() - t0 });
    } else {
      const grid = runSweep(base, sweep.axes, data);
      set({ result: null, grid, computeMs: performance.now() - t0 });
    }
  },
}));
