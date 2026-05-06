import {
  computeWeights,
  computeWithdrawal,
  type AllocationStrategy,
  type WithdrawalStrategy,
} from './strategies';
import type {
  AnnualReturns,
  SimulationResult,
  Weights,
  YearState,
} from './types';

export type SimulateInput = {
  startYear: number;
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  /**
   * Returns for years startYear..startYear+horizonYears-1. If shorter, sim is
   * truncated and marked inProgress.
   */
  returns: AnnualReturns[];
  /** Optional metadata for bootstrap-tail sims. */
  bootstrapped?: boolean;
  prefixYears?: number;
};

export function simulate(input: SimulateInput): SimulationResult {
  const {
    startYear,
    initialBalance,
    horizonYears,
    allocation,
    withdrawal,
    returns,
    bootstrapped = false,
    prefixYears = horizonYears,
  } = input;

  const trajectory: SimulationResult['trajectory'] = [];
  let balance = initialBalance;
  const inProgress = returns.length < horizonYears;
  const effectiveHorizon = Math.min(horizonYears, returns.length);

  for (let t = 0; t < effectiveHorizon; t++) {
    const r = returns[t];
    const calendarYear = startYear + t;
    const state: YearState = { t, balance, calendarYear, trajectory };

    const weights: Weights = computeWeights(
      allocation,
      state,
      initialBalance,
      r.inflation,
    );
    const wd = computeWithdrawal(
      withdrawal,
      state,
      initialBalance,
      r.inflation,
    );

    balance -= wd;
    if (balance <= 0) {
      trajectory.push({
        t,
        calendarYear,
        balance: 0,
        withdrawal: wd,
        weights,
        depleted: true,
      });
      return {
        startYear,
        trajectory,
        success: false,
        inProgress: false,
        bootstrapped,
        prefixYears,
        depletedAt: t,
      };
    }

    const cashRet = r.cash_return_real ?? 0;
    const cashWeight = r.cash_return_real == null ? 0 : weights.cash;
    // If cash data is missing, drop the cash sleeve and renormalize remaining
    // weights. Otherwise users get a silent partial withdrawal effect.
    let s = weights.stock;
    let b = weights.bond;
    let c = cashWeight;
    const sum = s + b + c;
    if (sum > 0 && sum !== 1) {
      s /= sum;
      b /= sum;
      c /= sum;
    }
    const portRet =
      s * r.stock_return_real + b * r.bond_return_real + c * cashRet;
    balance *= 1 + portRet;

    trajectory.push({
      t,
      calendarYear,
      balance,
      withdrawal: wd,
      weights,
      return: portRet,
    });
  }

  return {
    startYear,
    trajectory,
    success: !inProgress,
    inProgress,
    bootstrapped,
    prefixYears,
    finalBalance: balance,
  };
}
