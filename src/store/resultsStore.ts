import { create } from 'zustand';
import {
  assembleGrid,
  planSweep,
  type SweepGrid,
} from '../engine/sweepRunner';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import type { ScenarioState } from './scenarioStore';
import type { SweepState } from './sweepStore';
import type { SimPool } from '../worker/pool';

export type ResultsState = {
  data: HistoricalSeries | null;
  result: ScenarioResult | null;
  grid: SweepGrid | null;
  computeMs: number;
  pool: SimPool | null;
  computing: boolean;
  setData: (d: HistoricalSeries) => void;
  setPool: (p: SimPool) => Promise<void>;
  recompute: (scenario: ScenarioState, sweep: SweepState) => Promise<void>;
};

export const useResultsStore = create<ResultsState>((set, get) => {
  // Serialize concurrent recomputes; only the latest one wins.
  let pendingId = 0;

  return {
    data: null,
    result: null,
    grid: null,
    computeMs: 0,
    pool: null,
    computing: false,

    setData: (data) => set({ data }),

    async setPool(pool) {
      const { data } = get();
      if (data) await pool.setData(data);
      set({ pool });
    },

    async recompute(scenario, sweep) {
      const { data, pool } = get();
      if (!data || !pool) return;
      const myId = ++pendingId;
      set({ computing: true });
      const t0 = performance.now();
      const base = {
        initialBalance: scenario.initialBalance,
        horizonYears: scenario.horizonYears,
        allocation: scenario.allocation,
        withdrawal: scenario.withdrawal,
        withdrawalSource: scenario.withdrawalSource,
        incomes: scenario.incomes,
        cashflows: scenario.cashflows,
        tailMethod: scenario.tailMethod,
      };
      const plan = planSweep(base, sweep.axes);
      const results = await pool.runMany(plan.scenarios);
      if (myId !== pendingId) return; // a newer recompute superseded us
      const grid = assembleGrid(plan, results);
      const ms = performance.now() - t0;
      if (plan.axes.length === 0) {
        set({
          result: results[0],
          grid: null,
          computeMs: ms,
          computing: false,
        });
      } else {
        set({ result: null, grid, computeMs: ms, computing: false });
      }
    },
  };
});
