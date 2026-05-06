import { create } from 'zustand';
import { runScenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import {
  deriveAllocation,
  deriveWithdrawal,
  type ScenarioState,
} from './scenarioStore';

export type ResultsState = {
  data: HistoricalSeries | null;
  result: ScenarioResult | null;
  setData: (d: HistoricalSeries) => void;
  recompute: (scenario: ScenarioState) => void;
};

export const useResultsStore = create<ResultsState>((set, get) => ({
  data: null,
  result: null,
  setData: (data) => set({ data }),
  recompute: (scenario) => {
    const { data } = get();
    if (!data) return;
    // Phase 2: synchronous main-thread compute. Phase 4 will move this into a
    // worker pool — see FOLLOWUPS.md.
    const result = runScenario(
      {
        initialBalance: scenario.initialBalance,
        horizonYears: scenario.horizonYears,
        allocation: deriveAllocation(scenario.weights),
        withdrawal: deriveWithdrawal(scenario.withdrawalRate),
      },
      data,
    );
    set({ result });
  },
}));
