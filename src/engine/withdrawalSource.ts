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
 * "bucket" is waterfall + a yearly refill rule: when the target sleeve falls
 * below `floor` (as a fraction of total), top it up from the source sleeve
 * back to `ceiling`, but only if the source is at or above
 * `sourceMinRatio × its initial value`. The classic "spend cash, only sell
 * stocks when they're up" play.
 */
export type RefillRule = {
  targetSleeve: Sleeve;
  /** Refill triggers when targetSleeve / total < floor (0..1). */
  floor: number;
  /** Refill restores targetSleeve / total back up to ceiling (0..1). */
  ceiling: number;
  sourceSleeve: Sleeve;
  /** Optional gating: only refill when sourceSleeve ≥ this × initial source value. */
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
 */
export function applyRefill(
  sleeves: Sleeves,
  rules: RefillRule[],
  initialSleeves: Sleeves,
): Sleeves {
  let s = sleeves;
  for (const rule of rules) {
    s = applyOneRefill(s, rule, initialSleeves);
  }
  return s;
}

function applyOneRefill(
  sleeves: Sleeves,
  rule: RefillRule,
  initialSleeves: Sleeves,
): Sleeves {
  const total = totalSleeves(sleeves);
  if (total <= 0) return sleeves;
  const targetFrac = sleeves[rule.targetSleeve] / total;
  if (targetFrac >= rule.floor) return sleeves;

  if (rule.sourceMinRatio != null) {
    const initSrc = initialSleeves[rule.sourceSleeve];
    if (initSrc > 0 && sleeves[rule.sourceSleeve] < rule.sourceMinRatio * initSrc) {
      return sleeves;
    }
  }

  const targetWant = rule.ceiling * total;
  const targetHave = sleeves[rule.targetSleeve];
  const deficit = targetWant - targetHave;
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
