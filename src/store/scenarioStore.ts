import { create } from 'zustand';
import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';
import type { Weights } from '../engine/types';

export type ScenarioState = {
  initialBalance: number;
  horizonYears: number;
  weights: Weights;
  withdrawalRate: number;
  setBalance: (n: number) => void;
  setHorizon: (n: number) => void;
  setWeights: (w: Weights) => void;
  setWithdrawalRate: (r: number) => void;
};

export const useScenarioStore = create<ScenarioState>((set) => ({
  initialBalance: 1_000_000,
  horizonYears: 30,
  weights: { stock: 0.6, bond: 0.4, cash: 0 },
  withdrawalRate: 0.04,
  setBalance: (initialBalance) => set({ initialBalance }),
  setHorizon: (horizonYears) => set({ horizonYears }),
  setWeights: (weights) => set({ weights }),
  setWithdrawalRate: (withdrawalRate) => set({ withdrawalRate }),
}));

export function deriveAllocation(weights: Weights): AllocationStrategy {
  return { type: 'static', weights };
}

export function deriveWithdrawal(rate: number): WithdrawalStrategy {
  return { type: 'fixedPercent', rate };
}
