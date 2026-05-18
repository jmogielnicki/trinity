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
  applyGlideStep,
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
      cape: returns[0]?.cape ?? null,
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
  // Last year's target weights — used to apply only the deliberate glide
  // step under withdrawal sources that otherwise let sleeves drift.
  let prevTarget: Weights | null = null;

  for (let t = 0; t < effectiveHorizon; t++) {
    const r = returns[t];
    const calendarYear = startYear + t;
    const balanceBefore = totalSleeves(sleeves);
    const state: YearState = {
      t,
      balance: balanceBefore,
      calendarYear,
      trajectory,
      cape: r.cape,
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
    const sleevesAtStart: Sleeves = { ...sleeves };
    sleeves = applyWithdrawal(sleeves, wd, withdrawalSource);
    const withdrawalBySleeve: Sleeves = {
      stock: sleevesAtStart.stock - sleeves.stock,
      bond: sleevesAtStart.bond - sleeves.bond,
      cash: sleevesAtStart.cash - sleeves.cash,
    };
    if (totalSleeves(sleeves) <= 0) {
      trajectory.push({
        t,
        calendarYear,
        balance: 0,
        withdrawal: wd,
        weights: weightsRaw,
        sleeves: { stock: 0, bond: 0, cash: 0 },
        depleted: true,
        sleevesStart: sleevesAtStart,
        withdrawalBySleeve,
        rebalanceFlow: { stock: 0, bond: 0, cash: 0 },
        returnBySleeve: { stock: 0, bond: 0, cash: 0 },
        refillFlow: { stock: 0, bond: 0, cash: 0 },
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

    // Steer toward the target allocation before returns, so year-t returns
    // are earned on year-t's allocation (matches the spec loop).
    const sleevesAfterWithdrawal: Sleeves = { ...sleeves };
    if (
      withdrawalSource.type === 'proportional' &&
      withdrawalSource.rebalance
    ) {
      // Full rebalance: snap back to target every year. Uses the data-adjusted
      // weights so we don't rebalance into a cash sleeve with no return data.
      sleeves = rebalanceTo(sleeves, weights);
    } else if (prevTarget) {
      // Drift modes (waterfall, bucket, rebalance-off proportional): don't
      // correct return drift, but still honor a deliberate glide-path shift
      // — otherwise the allocation strategy is silently ignored after year 0.
      // The glide step is computed from *raw* (un-data-adjusted) weights so a
      // change in cash-data availability — e.g. cash returns starting in 1934
      // — isn't mistaken for an intentional allocation shift. A static
      // allocation therefore produces no glide step at all.
      sleeves = applyGlideStep(sleeves, prevTarget, weightsRaw);
    }
    const rebalanceFlow: Sleeves = {
      stock: sleeves.stock - sleevesAfterWithdrawal.stock,
      bond: sleeves.bond - sleevesAfterWithdrawal.bond,
      cash: sleeves.cash - sleevesAfterWithdrawal.cash,
    };
    prevTarget = weightsRaw;

    const beforeReturns: Sleeves = { ...sleeves };

    // Apply per-sleeve returns.
    sleeves = applyReturns(sleeves, r);
    const returnBySleeve: Sleeves = {
      stock: sleeves.stock - beforeReturns.stock,
      bond: sleeves.bond - beforeReturns.bond,
      cash: sleeves.cash - beforeReturns.cash,
    };

    // Bucket refill rule: runs after returns, moves between sleeves only when
    // the trigger and source conditions fire.
    let refillFlow: Sleeves = { stock: 0, bond: 0, cash: 0 };
    if (withdrawalSource.type === 'bucket') {
      const beforeRefill: Sleeves = { ...sleeves };
      sleeves = applyRefill(sleeves, withdrawalSource.refill, initialSleeves, wd, r);
      refillFlow = {
        stock: sleeves.stock - beforeRefill.stock,
        bond: sleeves.bond - beforeRefill.bond,
        cash: sleeves.cash - beforeRefill.cash,
      };
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
      sleevesStart: sleevesAtStart,
      withdrawalBySleeve,
      rebalanceFlow,
      returnBySleeve,
      refillFlow,
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
