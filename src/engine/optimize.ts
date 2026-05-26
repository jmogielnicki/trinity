import type { Scenario, TailMethod } from './sweep';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from './strategies';
import type { WithdrawalSource } from './withdrawalSource';
import type { ScenarioResult, SimulationResult } from './types';
import { minBalanceReached, weightedQuantile, type WeightedSample } from './stats';

export type CandidateMetrics = {
  successRate: number;
  /** Median final balance across completed sims (failures count as 0). */
  p50Final: number;
  /** 5th-percentile final balance (downside). */
  p5Final: number;
  /** 25th-percentile final balance (lower quartile). */
  p25Final: number;
  /** 75th-percentile final balance (upper quartile). */
  p75Final: number;
  /** 95th-percentile final balance (upside). */
  p95Final: number;
  /**
   * Average annual withdrawal across completed sims, in real $. For
   * "live the high life" comparisons — higher is better.
   */
  avgAnnualWithdrawal: number;
  /**
   * Avg # of years per completed sim where balance dipped below
   * NEAR_DEPLETION_FRACTION of the initial balance. Lower is better;
   * tells you how much time you spent sweating during bad sequences.
   */
  avgYearsNearDepletion: number;
  /**
   * Lowest year-end balance ever reached across every sim, in real $ —
   * the closest any historical sequence came to depletion, mid-retirement
   * or otherwise. 0 if any sequence depletes. Higher is better.
   */
  minBalance: number;
  /** Worst completed start year (the earliest failure), if any. */
  worstStartYear?: number;
  completedCount: number;
};

export const NEAR_DEPLETION_FRACTION = 0.25;

export type CandidateNumericParams = {
  /** Representative stock fraction (start of glide path for glidepath, weight for static). */
  stockPct?: number;
  /** Constant rate for `fixedPercent` withdrawals. */
  withdrawalRate?: number;
  /** Floor for `floorAndUpside`. */
  floor?: number;
  /** Upside rate for `floorAndUpside`. */
  upsideRate?: number;
  /** Value of the primary swept dimension in a study. */
  varyValue?: number;
  /** Value of the secondary swept dimension in a 2D study. */
  varyValue2?: number;
};

export type Candidate = {
  id: string;
  label: string;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  withdrawalSource?: WithdrawalSource;
  /** Short human-readable parameter descriptor for the comparison table. */
  params: {
    withdrawal: string;
    allocation: string;
    source?: string;
  };
  /** Numeric parameter values pulled out for axis/color coding. */
  numericParams: CandidateNumericParams;
};

export type CandidateResult = {
  candidate: Candidate;
  metrics: CandidateMetrics;
  /** Full scenario result, kept so 1D studies can show trajectory fans. */
  result: ScenarioResult;
  /** Index into sorted frontier (only set for Pareto-optimal results). */
  paretoRank?: number;
};

export type OptimizeConfig = {
  initialBalance: number;
  horizonYears: number;
  tailMethod?: TailMethod;
};

export function candidateToScenario(
  c: Candidate,
  cfg: OptimizeConfig,
): Scenario {
  return {
    initialBalance: cfg.initialBalance,
    horizonYears: cfg.horizonYears,
    allocation: c.allocation,
    withdrawal: c.withdrawal,
    withdrawalSource: c.withdrawalSource,
    tailMethod: cfg.tailMethod ?? { type: 'truncate' },
  };
}

function finalBalances(result: ScenarioResult): WeightedSample[] {
  const out: WeightedSample[] = [];
  for (const s of result.sims as SimulationResult[]) {
    if (s.inProgress) continue;
    // Bootstrap samples carry weight 1/samplesPerPrefix; observed cohorts 1.
    const weight = s.weight ?? 1;
    if (!s.success) {
      out.push({ value: 0, weight });
    } else if (typeof s.finalBalance === 'number') {
      out.push({ value: s.finalBalance, weight });
    } else if (s.trajectory.length > 0) {
      out.push({
        value: s.trajectory[s.trajectory.length - 1].balance,
        weight,
      });
    }
  }
  return out;
}

export function metricsFromResult(
  result: ScenarioResult,
  initialBalance: number,
): CandidateMetrics {
  const finals = finalBalances(result);
  const p5 = finals.length ? weightedQuantile(finals, 0.05) : NaN;
  const p25 = finals.length ? weightedQuantile(finals, 0.25) : NaN;
  const p50 = finals.length ? weightedQuantile(finals, 0.5) : NaN;
  const p75 = finals.length ? weightedQuantile(finals, 0.75) : NaN;
  const p95 = finals.length ? weightedQuantile(finals, 0.95) : NaN;

  // Per-sim averages: only count completed sims (in-progress sims have
  // truncated trajectories that would skew the averages). Bootstrap samples
  // carry weight 1/samplesPerPrefix so a cohort counts once, not N times.
  const depletionThreshold = NEAR_DEPLETION_FRACTION * initialBalance;
  let withdrawalWeighted = 0;
  let yearsNearWeighted = 0;
  let weightSum = 0;
  for (const s of result.sims) {
    if (s.inProgress) continue;
    const weight = s.weight ?? 1;
    weightSum += weight;
    let wdTotal = 0;
    let yearsNear = 0;
    let yearsCounted = 0;
    for (const rec of s.trajectory) {
      wdTotal += rec.withdrawal;
      yearsCounted++;
      if (rec.balance < depletionThreshold) yearsNear++;
    }
    withdrawalWeighted +=
      weight * (yearsCounted > 0 ? wdTotal / yearsCounted : 0);
    yearsNearWeighted += weight * yearsNear;
  }
  const avgAnnualWithdrawal =
    weightSum > 0 ? withdrawalWeighted / weightSum : NaN;
  const avgYearsNearDepletion =
    weightSum > 0 ? yearsNearWeighted / weightSum : NaN;

  return {
    // Use the bootstrap-projected rate when present (already cohort-weighted);
    // otherwise the observed historical rate.
    successRate: result.projectedSuccessRate ?? result.successRate,
    p5Final: p5,
    p25Final: p25,
    p50Final: p50,
    p75Final: p75,
    p95Final: p95,
    avgAnnualWithdrawal,
    avgYearsNearDepletion,
    minBalance: minBalanceReached(result.sims),
    worstStartYear: result.worstStartYear,
    completedCount: result.completedCount,
  };
}

/**
 * Pareto front over four maximize-objectives:
 *   successRate, avgAnnualWithdrawal, p50Final, p95Final.
 *
 * Including avgAnnualWithdrawal alongside the final-balance metrics lets
 * "live high, leave little" strategies (e.g. high-rate percent-of-balance)
 * surface on the frontier instead of being dominated by hoard-everything
 * strategies that leave huge final balances.
 *
 * A candidate is on the front if no other candidate beats it on all four
 * (with at least one strict). Ties are kept (both are non-dominated).
 */
export function paretoFront(results: CandidateResult[]): CandidateResult[] {
  const objectives = (r: CandidateResult) =>
    [
      r.metrics.successRate,
      r.metrics.avgAnnualWithdrawal,
      r.metrics.p50Final,
      r.metrics.p95Final,
    ] as const;
  const front: CandidateResult[] = [];
  for (const r of results) {
    const a = objectives(r);
    if (!Number.isFinite(a[0])) continue;
    let dominated = false;
    for (const other of results) {
      if (other === r) continue;
      const b = objectives(other);
      const allGE = b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2] && b[3] >= a[3];
      const anyGT = b[0] > a[0] || b[1] > a[1] || b[2] > a[2] || b[3] > a[3];
      if (allGE && anyGT) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(r);
  }
  // Rank along success rate for display.
  front.sort((x, y) => y.metrics.successRate - x.metrics.successRate);
  front.forEach((r, i) => (r.paretoRank = i));
  return front;
}
