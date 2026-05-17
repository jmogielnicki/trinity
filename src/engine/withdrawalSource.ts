import type { AnnualReturns, Sleeves, Sleeve, Weights } from './types';

/**
 * How withdrawals are sourced from the portfolio. The "proportional + rebalance"
 * default reproduces the old whole-portfolio behavior: target weights apply
 * each year, withdrawals come out proportionally, sleeves rebalance back to
 * target after returns.
 *
 * "waterfall" lets a cash sleeve actually act like a buffer — drain it first
 * during downturns, only touch stocks/bonds when cash is empty. No automatic
 * rebalance: sleeves drift over time the way they would in real life.
 *
 * "bucket" is waterfall + a chain of refill rules that run after returns each
 * year. Rules are evaluated in order; each sees sleeves as modified by the
 * previous rule.
 */
export type RefillRule = {
  targetSleeve: Sleeve;
  /**
   * Refill triggers when the target sleeve falls below this floor.
   * Interpretation depends on floorMode:
   *   'portfolioFraction' (default): floor is 0..1, compared against
   *     targetSleeve / totalPortfolio.
   *   'withdrawalYears': floor is a number of years; compared against
   *     targetSleeve in dollars vs floor × annualWithdrawal.
   */
  floor: number;
  /** Refill restores the target sleeve back up to ceiling (same units as floor). */
  ceiling: number;
  /** How floor/ceiling are interpreted. Defaults to 'portfolioFraction'. */
  floorMode?: 'portfolioFraction' | 'withdrawalYears';
  sourceSleeve: Sleeve;
  /**
   * Optional: only refill when the source sleeve's real return this year
   * exceeded this threshold. Set to 0 to mean "only in positive-return years".
   * Undefined = no return gate (always fire when floor is breached).
   */
  sourceReturnGate?: number;
  /** Optional: only refill when sourceSleeve ≥ this × its initial value. */
  sourceMinRatio?: number;
};

export type WithdrawalSource =
  | { type: 'proportional'; rebalance: boolean }
  | { type: 'waterfall'; order: Sleeve[] }
  | { type: 'bucket'; order: Sleeve[]; refill: RefillRule[] };

export const DEFAULT_WITHDRAWAL_SOURCE: WithdrawalSource = {
  type: 'proportional',
  rebalance: true,
};

export const DEFAULT_WATERFALL_ORDER: Sleeve[] = ['cash', 'bond', 'stock'];

export function totalSleeves(s: Sleeves): number {
  return s.stock + s.bond + s.cash;
}

/**
 * Drop the cash weight (folding it into bonds) for years where cash data is
 * unavailable. Without this, a pre-1934 sim with a cash sleeve would silently
 * accumulate "phantom" cash that earns 0% real, which is misleading.
 */
export function adjustWeightsForData(w: Weights, r: AnnualReturns): Weights {
  if (r.cash_return_real != null) return w;
  if (w.cash === 0) return w;
  return { stock: w.stock, bond: w.bond + w.cash, cash: 0 };
}

export function applyWithdrawal(
  sleeves: Sleeves,
  amount: number,
  source: WithdrawalSource,
): Sleeves {
  const total = totalSleeves(sleeves);
  if (amount <= 0 || total <= 0) return { ...sleeves };

  if (source.type === 'proportional') {
    // Withdraw proportionally to current sleeve sizes. With rebalance=true
    // we'll snap back to target weights after returns; with rebalance=false
    // the ratios persist.
    const ratio = Math.min(1, amount / total);
    return {
      stock: sleeves.stock * (1 - ratio),
      bond: sleeves.bond * (1 - ratio),
      cash: sleeves.cash * (1 - ratio),
    };
  }

  // waterfall and bucket both drain in the configured order during the
  // withdrawal step; bucket adds a refill step after returns (see applyRefill).
  const order = source.order;
  let remaining = amount;
  const next: Sleeves = { ...sleeves };
  for (const k of order) {
    if (remaining <= 0) break;
    const take = Math.min(next[k], remaining);
    next[k] -= take;
    remaining -= take;
  }
  return next;
}

/**
 * Apply a chain of bucket refill rules after returns, in order. Each rule
 * only moves money between sleeves; the total stays constant. A rule is
 * skipped if its trigger conditions don't fire.
 *
 * annualWithdrawal is required for rules with floorMode 'withdrawalYears'.
 * returns is required for rules with a sourceReturnGate.
 */
export function applyRefill(
  sleeves: Sleeves,
  rules: RefillRule[],
  initialSleeves: Sleeves,
  annualWithdrawal: number,
  returns: AnnualReturns,
): Sleeves {
  let s = sleeves;
  for (const rule of rules) {
    s = applyOneRefill(s, rule, initialSleeves, annualWithdrawal, returns);
  }
  return s;
}

function sleeveReturn(sleeve: Sleeve, r: AnnualReturns): number {
  if (sleeve === 'stock') return r.stock_return_real;
  if (sleeve === 'bond') return r.bond_return_real;
  return r.cash_return_real ?? 0;
}

function applyOneRefill(
  sleeves: Sleeves,
  rule: RefillRule,
  initialSleeves: Sleeves,
  annualWithdrawal: number,
  returns: AnnualReturns,
): Sleeves {
  const total = totalSleeves(sleeves);
  if (total <= 0) return sleeves;

  // Evaluate the floor condition and target ceiling in dollar terms.
  let belowFloor: boolean;
  let targetWant: number;
  if (rule.floorMode === 'withdrawalYears') {
    const floorDollars = rule.floor * annualWithdrawal;
    belowFloor = sleeves[rule.targetSleeve] < floorDollars;
    targetWant = rule.ceiling * annualWithdrawal;
  } else {
    belowFloor = sleeves[rule.targetSleeve] / total < rule.floor;
    targetWant = rule.ceiling * total;
  }
  if (!belowFloor) return sleeves;

  // Return gate: only refill when the source sleeve had a return above the threshold.
  if (rule.sourceReturnGate != null) {
    if (sleeveReturn(rule.sourceSleeve, returns) <= rule.sourceReturnGate) {
      return sleeves;
    }
  }

  // Absolute-level gate: only refill when source is above a fraction of its initial value.
  if (rule.sourceMinRatio != null) {
    const initSrc = initialSleeves[rule.sourceSleeve];
    if (initSrc > 0 && sleeves[rule.sourceSleeve] < rule.sourceMinRatio * initSrc) {
      return sleeves;
    }
  }

  const deficit = targetWant - sleeves[rule.targetSleeve];
  if (deficit <= 0) return sleeves;
  const move = Math.min(deficit, sleeves[rule.sourceSleeve]);
  if (move <= 0) return sleeves;
  return {
    ...sleeves,
    [rule.targetSleeve]: sleeves[rule.targetSleeve] + move,
    [rule.sourceSleeve]: sleeves[rule.sourceSleeve] - move,
  };
}

export function applyReturns(sleeves: Sleeves, r: AnnualReturns): Sleeves {
  // Treat null cash returns as 0% real (cash holds purchasing power but
  // earns nothing) — only relevant when adjustWeightsForData hasn't already
  // forced the cash sleeve to zero.
  const cashRet = r.cash_return_real ?? 0;
  return {
    stock: sleeves.stock * (1 + r.stock_return_real),
    bond: sleeves.bond * (1 + r.bond_return_real),
    cash: sleeves.cash * (1 + cashRet),
  };
}

export function rebalanceTo(sleeves: Sleeves, weights: Weights): Sleeves {
  const total = totalSleeves(sleeves);
  if (total <= 0) return { ...sleeves };
  return {
    stock: total * weights.stock,
    bond: total * weights.bond,
    cash: total * weights.cash,
  };
}

/**
 * Apply only the *deliberate* allocation shift between two target-weight
 * sets — the year-over-year glide step — to the current sleeves, without
 * correcting accumulated return drift. Used by waterfall/bucket sources,
 * which intentionally let sleeves drift but should still honor a glide
 * path the user explicitly asked for. For a static allocation the two
 * targets are identical, so this is a no-op and the drift is untouched.
 */
export function applyGlideStep(
  sleeves: Sleeves,
  prevTarget: Weights,
  curTarget: Weights,
): Sleeves {
  const ds = curTarget.stock - prevTarget.stock;
  const db = curTarget.bond - prevTarget.bond;
  const dc = curTarget.cash - prevTarget.cash;
  if (ds === 0 && db === 0 && dc === 0) return sleeves;
  const total = totalSleeves(sleeves);
  if (total <= 0) return sleeves;
  const shifted = {
    stock: Math.max(0, sleeves.stock / total + ds),
    bond: Math.max(0, sleeves.bond / total + db),
    cash: Math.max(0, sleeves.cash / total + dc),
  };
  const sum = shifted.stock + shifted.bond + shifted.cash;
  if (sum <= 0) return sleeves;
  return {
    stock: total * (shifted.stock / sum),
    bond: total * (shifted.bond / sum),
    cash: total * (shifted.cash / sum),
  };
}

export function effectiveReturn(
  before: Sleeves,
  after: Sleeves,
  withdrawal: number,
): number {
  const start = totalSleeves(before);
  if (start <= 0) return 0;
  const end = totalSleeves(after);
  // Recover the per-period return implied by (start - withdrawal) → end.
  const postWithdrawal = start - withdrawal;
  if (postWithdrawal <= 0) return -1;
  return end / postWithdrawal - 1;
}
