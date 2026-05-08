import { create } from 'zustand';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from '../engine/strategies';
import type { TailMethod } from '../engine/sweep';
import type { Weights } from '../engine/types';
import {
  DEFAULT_WITHDRAWAL_SOURCE,
  type WithdrawalSource,
} from '../engine/withdrawalSource';

export type ScenarioState = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  withdrawalSource: WithdrawalSource;
  tailMethod: TailMethod;
  setBalance: (n: number) => void;
  setHorizon: (n: number) => void;
  setAllocation: (a: AllocationStrategy) => void;
  setWithdrawal: (w: WithdrawalStrategy) => void;
  setWithdrawalSource: (s: WithdrawalSource) => void;
  setTailMethod: (t: TailMethod) => void;
};

const DEFAULT_WEIGHTS: Weights = { stock: 0.6, bond: 0.4, cash: 0 };

export const useScenarioStore = create<ScenarioState>((set) => ({
  initialBalance: 1_000_000,
  horizonYears: 30,
  allocation: { type: 'static', weights: DEFAULT_WEIGHTS },
  withdrawal: { type: 'fixedPercent', rate: 0.04 },
  withdrawalSource: DEFAULT_WITHDRAWAL_SOURCE,
  tailMethod: { type: 'truncate' },
  setBalance: (initialBalance) => set({ initialBalance }),
  setHorizon: (horizonYears) => set({ horizonYears }),
  setAllocation: (allocation) => set({ allocation }),
  setWithdrawal: (withdrawal) => set({ withdrawal }),
  setWithdrawalSource: (withdrawalSource) => set({ withdrawalSource }),
  setTailMethod: (tailMethod) => set({ tailMethod }),
}));
