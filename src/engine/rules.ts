import type { Weights, YearState } from './types';

export type Condition =
  | { type: 'returnAbove'; threshold: number; lookback: number }
  | { type: 'balanceVsInitial'; ratio: number; comparator: '>' | '<' }
  | { type: 'yearRange'; from: number; to: number }
  | { type: 'inflationAbove'; threshold: number };

export type Action =
  | { type: 'setWithdrawal'; rate: number }
  | { type: 'shiftAllocation'; delta: Weights };

export type Rule = { if: Condition; then: Action };

export function evalCondition(
  cond: Condition,
  state: YearState,
  initialBalance: number,
  inflation: number,
): boolean {
  switch (cond.type) {
    case 'returnAbove': {
      const slice = state.trajectory.slice(-cond.lookback);
      if (slice.length === 0) return false;
      const avg =
        slice.reduce((s, r) => s + (r.return ?? 0), 0) / slice.length;
      return avg > cond.threshold;
    }
    case 'balanceVsInitial': {
      const ratio = state.balance / initialBalance;
      return cond.comparator === '>' ? ratio > cond.ratio : ratio < cond.ratio;
    }
    case 'yearRange':
      return state.t >= cond.from && state.t <= cond.to;
    case 'inflationAbove':
      return inflation > cond.threshold;
  }
}
