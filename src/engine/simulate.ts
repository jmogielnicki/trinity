import {
  computeWeights,
  computeWithdrawal,
  type AllocationStrategy,
  type WithdrawalStrategy,
} from './strategies';
import type {
  AnnualReturns,
  SimulationResult,
  Sleeves,
  Weights,
  YearState,
} from './types';
import {
  adjustWeightsForData,
  applyRefill,
  applyReturns,
  applyWithdrawal,
  DEFAULT_WITHDRAWAL_SOURCE,
  effectiveReturn,
  rebalanceTo,
  totalSleeves,
  type WithdrawalSource,
} from './withdrawalSource';

export type SimulateInput = {
  startYear: number;
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  /** How withdrawals are sourced. Default: proportional + annual rebalance. */
  withdrawalSource?: WithdrawalSource;
  /**
   * Returns for years startYear..startYear+horizonYears-1. If shorter, sim is
   * truncated and marked inProgress.
   */
  returns: AnnualReturns[];
  /** Optional metadata for bootstrap-tail sims. */
  bootstrapped?: boolean;
  prefixYears?: number;
};

function splitInitial(initial: number, w: Weights): Sleeves {
  return {
    stock: initial * w.stock,
    bond: initial * w.bond,
    cash: initial * w.cash,
  };
}

export function simulate(input: SimulateInput): SimulationResult {
  const {
    startYear,
    initialBalance,
    horizonYears,
    allocation,
    withdrawal,
    withdrawalSource = DEFAULT_WITHDRAWAL_SOURCE,
    returns,
    bootstrapped = false,
    prefixYears = horizonYears,
  } = input;

  const trajectory: SimulationResult['trajectory'] = [];
  const inProgress = returns.length < horizonYears;
  const effectiveHorizon = Math.min(horizonYears, returns.length);

  // Seed sleeves from the year-0 target weights. If the first year has no
  // cash data, fold cash into bond up front so we don't carry phantom cash.
  let sleeves: Sleeves;
  {
    const seedState: YearState = {
      t: 0,
      balance: initialBalance,
      calendarYear: startYear,
      trajectory,
    };
    const w0Raw = computeWeights(
      allocation,
      seedState,
      initialBalance,
      returns[0]?.inflation ?? 0,
    );
    const w0 = returns[0]
      ? adjustWeightsForData(w0Raw, returns[0])
      : w0Raw;
    sleeves = splitInitial(initialBalance, w0);
  }
  const initialSleeves: Sleeves = { ...sleeves };

  for (let t = 0; t < effectiveHorizon; t++) {
    const r = returns[t];
    const calendarYear = startYear + t;
    const balanceBefore = totalSleeves(sleeves);
    const state: YearState = {
      t,
      balance: balanceBefore,
      calendarYear,
      trajectory,
    };

    const weightsRaw: Weights = computeWeights(
      allocation,
      state,
      initialBalance,
      r.inflation,
    );
    const weights = adjustWeightsForData(weightsRaw, r);

    const wd = computeWithdrawal(
      withdrawal,
      state,
      initialBalance,
      r.inflation,
    );

    // Withdraw at start of year.
    sleeves = applyWithdrawal(sleeves, wd, withdrawalSource);
    if (totalSleeves(sleeves) <= 0) {
      trajectory.push({
        t,
        calendarYear,
        balance: 0,
        withdrawal: wd,
        weights: weightsRaw,
        sleeves: { stock: 0, bond: 0, cash: 0 },
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

    // Rebalance to target before returns, so year-t returns are earned on
    // year-t's allocation (matches the spec loop). When data forced cash → 0,
    // rebalance uses the adjusted weights so we don't try to refill a sleeve
    // we just dropped.
    if (
      withdrawalSource.type === 'proportional' &&
      withdrawalSource.rebalance
    ) {
      sleeves = rebalanceTo(sleeves, weights);
    }

    const beforeReturns: Sleeves = { ...sleeves };

    // Apply per-sleeve returns.
    sleeves = applyReturns(sleeves, r);

    // Bucket refill rule: runs after returns, moves between sleeves only when
    // the trigger and source conditions fire.
    if (withdrawalSource.type === 'bucket') {
      sleeves = applyRefill(sleeves, withdrawalSource.refill, initialSleeves, wd, r);
    }

    const portRet = effectiveReturn(beforeReturns, sleeves, 0);

    trajectory.push({
      t,
      calendarYear,
      balance: totalSleeves(sleeves),
      withdrawal: wd,
      weights: weightsRaw,
      sleeves: { ...sleeves },
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
    finalBalance: totalSleeves(sleeves),
  };
}
