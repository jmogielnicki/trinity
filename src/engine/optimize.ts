import type { Scenario, TailMethod } from './sweep';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from './strategies';
import type { ScenarioResult, SimulationResult } from './types';
import { quantile } from './stats';

export type CandidateMetrics = {
  successRate: number;
  /** Median final balance across completed sims (failures count as 0). */
  p50Final: number;
  /** 5th-percentile final balance (downside). */
  p5Final: number;
  /** 95th-percentile final balance (upside). */
  p95Final: number;
  /** Mean withdrawal across every simulated year of every sim (real $). */
  avgWithdrawal: number;
  /** Lowest year-end balance ever reached across all sims (real $). */
  minBalance: number;
  /** Worst completed start year (the earliest failure), if any. */
  worstStartYear?: number;
  completedCount: number;
};

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
const WITHDRAWAL_RATES_POB = [0.035, 0.04, 0.045, 0.05, 0.055, 0.06];
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
    ...WITHDRAWAL_RATES_POB.map((r) => ({
      wd: { type: 'percentOfBalance', rate: r } as WithdrawalStrategy,
      label: `% of balance ${pct(r)}`,
      short: `${pct(r)} of bal`,
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

function finalBalances(result: ScenarioResult): number[] {
  const out: number[] = [];
  for (const s of result.sims as SimulationResult[]) {
    if (s.inProgress) continue;
    if (!s.success) {
      out.push(0);
    } else if (typeof s.finalBalance === 'number') {
      out.push(s.finalBalance);
    } else if (s.trajectory.length > 0) {
      out.push(s.trajectory[s.trajectory.length - 1].balance);
    }
  }
  return out;
}

/** Mean withdrawal per simulated year, pooled across every sim. */
function avgAnnualWithdrawal(result: ScenarioResult): number {
  let sum = 0;
  let n = 0;
  for (const s of result.sims as SimulationResult[]) {
    for (const rec of s.trajectory) {
      sum += rec.withdrawal;
      n++;
    }
  }
  return n === 0 ? NaN : sum / n;
}

/**
 * Lowest year-end balance reached anywhere — captures mid-retirement near
 * misses, not just the final balance. Hits 0 for any scenario that ever
 * depletes.
 */
function minBalanceReached(result: ScenarioResult): number {
  let min = Infinity;
  for (const s of result.sims as SimulationResult[]) {
    for (const rec of s.trajectory) {
      if (rec.balance < min) min = rec.balance;
    }
  }
  return Number.isFinite(min) ? min : NaN;
}

export function metricsFromResult(result: ScenarioResult): CandidateMetrics {
  const finals = finalBalances(result).sort((a, b) => a - b);
  const p5 = finals.length ? quantile(finals, 0.05) : NaN;
  const p50 = finals.length ? quantile(finals, 0.5) : NaN;
  const p95 = finals.length ? quantile(finals, 0.95) : NaN;
  return {
    successRate: result.successRate,
    p5Final: p5,
    p50Final: p50,
    p95Final: p95,
    avgWithdrawal: avgAnnualWithdrawal(result),
    minBalance: minBalanceReached(result),
    worstStartYear: result.worstStartYear,
    completedCount: result.completedCount,
  };
}

/**
 * Pareto front over (successRate, p50Final, p95Final). A candidate is on the
 * front if no other candidate beats it on all three (with at least one strict).
 * Ties on all three are kept (both are non-dominated).
 */
export function paretoFront(results: CandidateResult[]): CandidateResult[] {
  const objectives = (r: CandidateResult) =>
    [r.metrics.successRate, r.metrics.p50Final, r.metrics.p95Final] as const;
  const front: CandidateResult[] = [];
  for (const r of results) {
    const [a1, a2, a3] = objectives(r);
    if (!Number.isFinite(a1)) continue;
    let dominated = false;
    for (const other of results) {
      if (other === r) continue;
      const [b1, b2, b3] = objectives(other);
      if (b1 >= a1 && b2 >= a2 && b3 >= a3 && (b1 > a1 || b2 > a2 || b3 > a3)) {
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
