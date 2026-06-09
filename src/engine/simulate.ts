import {
  cashflowAt,
  incomeAt,
  type IncomeStream,
  type OneTimeCashflow,
} from './cashflows';
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
  /** Recurring external income (Social Security, pensions) — offsets withdrawals. */
  incomes?: IncomeStream[];
  /** One-time external cash flows (inheritance, a roof, downsizing). */
  cashflows?: OneTimeCashflow[];
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

/**
 * Invest an external surplus (income or inflow beyond this year's spending)
 * into the portfolio. Deposits follow the current sleeve mix so drift modes
 * stay undisturbed; an empty portfolio seeds at the target weights instead.
 */
function deposit(s: Sleeves, amount: number, target: Weights): Sleeves {
  const total = s.stock + s.bond + s.cash;
  if (total > 0) {
    return {
      stock: s.stock + amount * (s.stock / total),
      bond: s.bond + amount * (s.bond / total),
      cash: s.cash + amount * (s.cash / total),
    };
  }
  return {
    stock: s.stock + amount * target.stock,
    bond: s.bond + amount * target.bond,
    cash: s.cash + amount * target.cash,
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
    incomes,
    cashflows,
    returns,
    bootstrapped = false,
    prefixYears = horizonYears,
  } = input;

  const trajectory: SimulationResult['trajectory'] = [];
  const inProgress = returns.length < horizonYears;
  const effectiveHorizon = Math.min(horizonYears, returns.length);

  // Seed sleeves from the year-0 target weights.
  let sleeves: Sleeves;
  {
    const seedState: YearState = {
      t: 0,
      balance: initialBalance,
      calendarYear: startYear,
      trajectory,
      cape: returns[0]?.cape ?? null,
    };
    const w0 = computeWeights(
      allocation,
      seedState,
      initialBalance,
      returns[0]?.inflation ?? 0,
    );
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

    // External cash flows offset the portfolio draw: the strategy's wd is
    // total spending, and the portfolio only funds what income and one-time
    // inflows don't cover. A surplus is invested. Like withdrawals, all of
    // this happens at the start of the year.
    const income = incomeAt(incomes, t);
    const oneTime = cashflowAt(cashflows, t);
    const netDraw = wd - income - oneTime;

    const sleevesAtStart: Sleeves = { ...sleeves };
    if (netDraw > 0) {
      sleeves = applyWithdrawal(sleeves, netDraw, withdrawalSource);
    } else if (netDraw < 0) {
      sleeves = deposit(sleeves, -netDraw, weights);
    }
    const withdrawalBySleeve: Sleeves = {
      stock: sleevesAtStart.stock - sleeves.stock,
      bond: sleevesAtStart.bond - sleeves.bond,
      cash: sleevesAtStart.cash - sleeves.cash,
    };
    // Depletion means the portfolio couldn't fund required spending — a year
    // fully covered by external income is fine even with a $0 portfolio.
    if (netDraw > 0 && totalSleeves(sleeves) <= 0) {
      trajectory.push({
        t,
        calendarYear,
        balance: 0,
        withdrawal: wd,
        ...(income > 0 && { income }),
        ...(oneTime !== 0 && { oneTime }),
        weights: weights,
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
      // Full rebalance: snap back to target every year.
      sleeves = rebalanceTo(sleeves, weights);
    } else if (prevTarget) {
      // Drift modes (waterfall, bucket, rebalance-off proportional): don't
      // correct return drift, but still honor a deliberate glide-path shift
      // — otherwise the allocation strategy is silently ignored after year 0.
      sleeves = applyGlideStep(sleeves, prevTarget, weights);
    }
    const rebalanceFlow: Sleeves = {
      stock: sleeves.stock - sleevesAfterWithdrawal.stock,
      bond: sleeves.bond - sleevesAfterWithdrawal.bond,
      cash: sleeves.cash - sleevesAfterWithdrawal.cash,
    };
    prevTarget = weights;

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
      // Size "withdrawal years" floors by the net portfolio draw — buckets
      // exist to cover what the portfolio funds, not spending paid by income.
      sleeves = applyRefill(
        sleeves,
        withdrawalSource.refill,
        initialSleeves,
        Math.max(0, netDraw),
        r,
      );
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
      ...(income > 0 && { income }),
      ...(oneTime !== 0 && { oneTime }),
      weights: weights,
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
