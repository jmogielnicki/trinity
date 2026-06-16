import { runScenario, type Scenario } from './sweep';
import type { HistoricalSeries } from './types';

/**
 * Inverse solvers — the questions every visitor arrives with:
 *   • "What's my safe withdrawal rate?"  → solveMaxSafeRate
 *   • "What's my number?" (balance)      → solveMinBalance
 *
 * Both are bisections over a monotonic dimension of the OBSERVED historical
 * success rate (truncate mode), so the solved figure matches the number the
 * StatPanel shows for the same scenario exactly. We force `truncate` here even
 * if the scenario asks for bootstrap: the observed success rate is identical
 * either way (bootstrap only adds sampled-tail sims, which are excluded from
 * the observed denominator), and a hard historical answer is what users want.
 */

export const DEFAULT_SOLVE_TARGET = 0.95;

/** Bisection bounds / iteration caps. Each step is one runScenario call. */
const RATE_LO = 0;
const RATE_HI = 0.2; // 20% — no realistic safe rate lives above this
const RATE_TOL = 1e-5; // 0.001% — well below display precision
const RATE_MAX_ITERS = 40;

const BAL_LO = 1_000;
const BAL_HI = 1_000_000_000; // $1B ceiling
const BAL_REL_TOL = 1e-3; // 0.1%
const BAL_MAX_ITERS = 60;

export type RateSolveResult =
  | {
      status: 'solved';
      /** Highest fixed rate whose observed success rate ≥ target. */
      rate: number;
      successRate: number;
      target: number;
    }
  /** Even the search ceiling clears the target — the rate isn't the constraint. */
  | { status: 'allSucceed'; rate: number; target: number }
  /** Withdrawal type the solver can't invert (variable strategy). */
  | { status: 'notApplicable'; reason: string };

export type BalanceSolveResult =
  | {
      status: 'solved';
      /** Smallest starting balance whose observed success rate ≥ target. */
      balance: number;
      /** The fixed real annual spend the number funds. */
      annualSpend: number;
      successRate: number;
      target: number;
    }
  /** Even a tiny balance clears the target — spending is fully covered. */
  | { status: 'allSucceed'; balance: number; annualSpend: number; target: number }
  /** Even the search ceiling can't clear the target — spending is too high. */
  | { status: 'noneSucceed'; annualSpend: number; target: number }
  | { status: 'notApplicable'; reason: string };

function observedRate(scenario: Scenario, data: HistoricalSeries): number {
  // Force truncate so the answer is a hard historical fact and matches the
  // displayed observed success rate.
  return runScenario({ ...scenario, tailMethod: { type: 'truncate' } }, data)
    .successRate;
}

/**
 * Highest `fixedPercent` rate whose observed historical success rate meets the
 * target. Success rate is monotonic-decreasing in the rate (more spending →
 * more failures), so a bisection on [0, 20%] is valid. Only the rate varies;
 * allocation, source, income, horizon and balance come from the scenario.
 */
export function solveMaxSafeRate(
  scenario: Scenario,
  data: HistoricalSeries,
  target = DEFAULT_SOLVE_TARGET,
): RateSolveResult {
  if (scenario.withdrawal.type !== 'fixedPercent') {
    return {
      status: 'notApplicable',
      reason: 'Safe-rate solving applies to fixed-percentage withdrawals.',
    };
  }
  const rateAt = (rate: number) =>
    observedRate({ ...scenario, withdrawal: { type: 'fixedPercent', rate } }, data);

  // The ceiling clears the target → not rate-constrained in our range.
  if (rateAt(RATE_HI) >= target) {
    return { status: 'allSucceed', rate: RATE_HI, target };
  }
  // RATE_LO (0% withdrawal) can never deplete a fixedPercent portfolio, so it
  // always succeeds — the invariant the bisection relies on.
  let lo = RATE_LO; // succeeds
  let hi = RATE_HI; // fails
  for (let i = 0; i < RATE_MAX_ITERS && hi - lo > RATE_TOL; i++) {
    const mid = (lo + hi) / 2;
    if (rateAt(mid) >= target) lo = mid;
    else hi = mid;
  }
  return { status: 'solved', rate: lo, successRate: rateAt(lo), target };
}

/**
 * The fixed real annual spend a plan implies, for the "what's my number"
 * question. `fixedPercent{rate}` is `rate × initialBalance` in real dollars and
 * is held flat (inflation-adjusted) every year — i.e. identical to a
 * `fixedDollar` plan at that amount — so both map cleanly onto a spending
 * target. Variable strategies have no single target spend, so they return null
 * and the solver reports notApplicable.
 */
function targetSpend(scenario: Scenario): number | null {
  const w = scenario.withdrawal;
  if (w.type === 'fixedDollar') return w.amount;
  if (w.type === 'fixedPercent') return w.rate * scenario.initialBalance;
  return null;
}

/**
 * Smallest starting balance whose observed success rate meets the target,
 * funding a *fixed* real annual spend (derived from the current plan — see
 * targetSpend). Solving a fixed-dollar plan is the only well-posed form of the
 * question: for a percentage rule everything scales with the balance, so its
 * success rate is balance-independent (with income it actually *falls* as the
 * balance grows). Fixing the spend is what makes a larger balance monotonically
 * safer and gives "your number" a meaning.
 */
export function solveMinBalance(
  scenario: Scenario,
  data: HistoricalSeries,
  target = DEFAULT_SOLVE_TARGET,
): BalanceSolveResult {
  const annualSpend = targetSpend(scenario);
  if (annualSpend == null) {
    return {
      status: 'notApplicable',
      reason:
        'Set a fixed-% or fixed-$ spending plan to find your number — variable strategies have no single spending target to size a balance against.',
    };
  }
  // Hold spending fixed (fixedDollar) and vary only the balance.
  const fixed: Scenario = {
    ...scenario,
    withdrawal: { type: 'fixedDollar', amount: annualSpend },
  };
  const okAt = (balance: number) =>
    observedRate({ ...fixed, initialBalance: balance }, data) >= target;

  if (okAt(BAL_LO))
    return { status: 'allSucceed', balance: BAL_LO, annualSpend, target };
  if (!okAt(BAL_HI)) return { status: 'noneSucceed', annualSpend, target };

  let lo = BAL_LO; // fails
  let hi = BAL_HI; // succeeds
  for (let i = 0; i < BAL_MAX_ITERS && (hi - lo) / hi > BAL_REL_TOL; i++) {
    const mid = (lo + hi) / 2;
    if (okAt(mid)) hi = mid;
    else lo = mid;
  }
  const successRate = observedRate({ ...fixed, initialBalance: hi }, data);
  return { status: 'solved', balance: hi, annualSpend, successRate, target };
}
