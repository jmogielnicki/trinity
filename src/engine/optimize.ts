import type { Scenario, TailMethod } from './sweep';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from './strategies';
import type { ScenarioResult, SimulationResult } from './types';
import { weightedQuantile, type WeightedSample } from './stats';

export type CandidateMetrics = {
  successRate: number;
  /** Median final balance across completed sims (failures count as 0). */
  p50Final: number;
  /** 5th-percentile final balance (downside). */
  p5Final: number;
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
  /** Worst completed start year (the earliest failure), if any. */
  worstStartYear?: number;
  completedCount: number;
};

export const NEAR_DEPLETION_FRACTION = 0.25;

export type Candidate = {
  id: string;
  label: string;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  /** Short human-readable parameter descriptor for the comparison table. */
  params: {
    withdrawal: string;
    allocation: string;
  };
};

export type CandidateResult = {
  candidate: Candidate;
  metrics: CandidateMetrics;
  /** Index into sorted frontier (only set for Pareto-optimal results). */
  paretoRank?: number;
};

export type OptimizeConfig = {
  initialBalance: number;
  horizonYears: number;
  tailMethod?: TailMethod;
};

const WITHDRAWAL_RATES_FIXED = [
  0.03, 0.0325, 0.035, 0.0375, 0.04, 0.0425, 0.045, 0.0475, 0.05, 0.055, 0.06,
];
type FloorUpsideSpec = {
  floor: number;
  gainStep: number;
  bumpPerStep: number;
};

/**
 * Floor + upside variants: a sticky real-$ floor that scales up with the
 * portfolio. Spans a few floors and a couple upside aggressiveness levels.
 */
const FLOOR_UPSIDE_SPECS: FloorUpsideSpec[] = [
  // floor 3.5%
  { floor: 0.035, gainStep: 0.1, bumpPerStep: 0.2 },
  { floor: 0.035, gainStep: 0.1, bumpPerStep: 0.5 },
  { floor: 0.035, gainStep: 0.2, bumpPerStep: 0.3 },
  // floor 4.0%
  { floor: 0.04, gainStep: 0.1, bumpPerStep: 0.2 },
  { floor: 0.04, gainStep: 0.1, bumpPerStep: 0.5 },
  { floor: 0.04, gainStep: 0.2, bumpPerStep: 0.3 },
  // floor 4.5%
  { floor: 0.045, gainStep: 0.1, bumpPerStep: 0.2 },
  { floor: 0.045, gainStep: 0.1, bumpPerStep: 0.5 },
  { floor: 0.045, gainStep: 0.2, bumpPerStep: 0.3 },
  // floor 5.0% (aggressive baseline)
  { floor: 0.05, gainStep: 0.1, bumpPerStep: 0.2 },
  { floor: 0.05, gainStep: 0.2, bumpPerStep: 0.3 },
];
const STATIC_STOCK_PCTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

type GlidePathSpec = {
  startStock: number;
  endStock: number;
  transitionYears: number;
};

const GLIDE_PATHS: GlidePathSpec[] = [
  { startStock: 0.8, endStock: 0.4, transitionYears: 20 },
  { startStock: 0.7, endStock: 0.5, transitionYears: 20 },
  { startStock: 0.6, endStock: 0.3, transitionYears: 15 },
  { startStock: 0.5, endStock: 0.8, transitionYears: 20 }, // rising equity
];

function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function staticAllocation(stockPct: number): {
  alloc: AllocationStrategy;
  label: string;
} {
  return {
    alloc: {
      type: 'static',
      weights: { stock: stockPct, bond: 1 - stockPct, cash: 0 },
    },
    label: `${Math.round(stockPct * 100)}/${Math.round((1 - stockPct) * 100)}/0`,
  };
}

function glideAllocation(g: GlidePathSpec): {
  alloc: AllocationStrategy;
  label: string;
} {
  return {
    alloc: {
      type: 'glidepath',
      start: { stock: g.startStock, bond: 1 - g.startStock, cash: 0 },
      end: { stock: g.endStock, bond: 1 - g.endStock, cash: 0 },
      transitionYears: g.transitionYears,
    },
    label: `glide ${Math.round(g.startStock * 100)}→${Math.round(g.endStock * 100)}% stk / ${g.transitionYears}y`,
  };
}

/** Cartesian product over the built-in search space. */
export function generateCandidates(): Candidate[] {
  const allocs: Array<{ alloc: AllocationStrategy; label: string }> = [
    ...STATIC_STOCK_PCTS.map(staticAllocation),
    ...GLIDE_PATHS.map(glideAllocation),
  ];

  const withdrawals: Array<{
    wd: WithdrawalStrategy;
    label: string;
    short: string;
  }> = [
    ...WITHDRAWAL_RATES_FIXED.map((r) => ({
      wd: { type: 'fixedPercent', rate: r } as WithdrawalStrategy,
      label: `fixed ${pct(r)}`,
      short: `${pct(r)} fixed`,
    })),
    ...FLOOR_UPSIDE_SPECS.map((s) => ({
      wd: {
        type: 'floorAndUpside',
        floor: s.floor,
        gainStep: s.gainStep,
        bumpPerStep: s.bumpPerStep,
      } as WithdrawalStrategy,
      label: `floor ${pct(s.floor)} +${pct(s.bumpPerStep)}/${pct(s.gainStep)} gain`,
      short: `${pct(s.floor)} floor +${pct(s.bumpPerStep)}/${pct(s.gainStep)}↑`,
    })),
  ];

  const out: Candidate[] = [];
  for (const a of allocs) {
    for (const w of withdrawals) {
      out.push({
        id: `${w.label}|${a.label}`,
        label: `${w.short} · ${a.label}`,
        allocation: a.alloc,
        withdrawal: w.wd,
        params: { withdrawal: w.short, allocation: a.label },
      });
    }
  }
  return out;
}

export function candidateToScenario(
  c: Candidate,
  cfg: OptimizeConfig,
): Scenario {
  return {
    initialBalance: cfg.initialBalance,
    horizonYears: cfg.horizonYears,
    allocation: c.allocation,
    withdrawal: c.withdrawal,
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
  const p50 = finals.length ? weightedQuantile(finals, 0.5) : NaN;
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
    p50Final: p50,
    p95Final: p95,
    avgAnnualWithdrawal,
    avgYearsNearDepletion,
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
