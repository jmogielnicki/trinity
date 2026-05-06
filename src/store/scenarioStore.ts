import { create } from 'zustand';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from '../engine/strategies';
import type { Weights } from '../engine/types';

export type ScenarioState = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  setBalance: (n: number) => void;
  setHorizon: (n: number) => void;
  setAllocation: (a: AllocationStrategy) => void;
  setWithdrawal: (w: WithdrawalStrategy) => void;
};

const DEFAULT_WEIGHTS: Weights = { stock: 0.6, bond: 0.4, cash: 0 };

export const useScenarioStore = create<ScenarioState>((set) => ({
  initialBalance: 1_000_000,
  horizonYears: 30,
  allocation: { type: 'static', weights: DEFAULT_WEIGHTS },
  withdrawal: { type: 'fixedPercent', rate: 0.04 },
  setBalance: (initialBalance) => set({ initialBalance }),
  setHorizon: (horizonYears) => set({ horizonYears }),
  setAllocation: (allocation) => set({ allocation }),
  setWithdrawal: (withdrawal) => set({ withdrawal }),
}));
