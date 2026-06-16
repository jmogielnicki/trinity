import type { PercentileBand, SimulationResult } from './types';

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
}

export type WeightedSample = { value: number; weight: number };

/**
 * Quantile of a weighted sample set. Each sample occupies a slice of the
 * cumulative weight; we place it at its slice midpoint (Hazen plotting
 * position) and interpolate between neighbours. When every weight is equal
 * this delegates to the plain `quantile` so equal-weight callers are
 * unaffected. The cross-sample weighting is what lets one bootstrap cohort's
 * N samples count as a single start year rather than N.
 */
export function weightedQuantile(samples: WeightedSample[], q: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const w0 = sorted[0].weight;
  if (sorted.every((s) => s.weight === w0)) {
    return quantile(
      sorted.map((s) => s.value),
      q,
    );
  }
  let total = 0;
  for (const s of sorted) total += s.weight;
  if (total <= 0) return NaN;
  const pos: number[] = [];
  let cum = 0;
  for (const s of sorted) {
    pos.push((cum + s.weight / 2) / total);
    cum += s.weight;
  }
  if (q <= pos[0]) return sorted[0].value;
  if (q >= pos[pos.length - 1]) return sorted[sorted.length - 1].value;
  for (let i = 0; i < pos.length - 1; i++) {
    if (q <= pos[i + 1]) {
      const frac = (q - pos[i]) / (pos[i + 1] - pos[i]);
      return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * frac;
    }
  }
  return sorted[sorted.length - 1].value;
}

function bandValues(samples: WeightedSample[]): PercentileBand['values'] {
  return {
    p5: weightedQuantile(samples, 0.05),
    p25: weightedQuantile(samples, 0.25),
    p50: weightedQuantile(samples, 0.5),
    p75: weightedQuantile(samples, 0.75),
    p95: weightedQuantile(samples, 0.95),
  };
}

/**
 * Build percentile bands from a subset of sims. Use this with a filter (e.g.
 * completed-only, or excluding bootstrap tails) so the band represents the
 * cohort you actually want to compare against.
 */
export function computePercentilesFiltered(
  sims: SimulationResult[],
  horizonYears: number,
  predicate: (s: SimulationResult) => boolean,
): PercentileBand[] {
  return computePercentiles(sims.filter(predicate), horizonYears);
}

export function computePercentiles(
  sims: SimulationResult[],
  horizonYears: number,
): PercentileBand[] {
  const bands: PercentileBand[] = [];
  for (let t = 0; t < horizonYears; t++) {
    const samples: WeightedSample[] = [];
    for (const s of sims) {
      const weight = s.weight ?? 1;
      const rec = s.trajectory[t];
      if (rec) {
        samples.push({ value: rec.balance, weight });
      } else if (s.depletedAt != null) {
        // A depleted sim has no trajectory record past depletedAt. It must
        // stay in the band at 0 — dropping it lets failed paths silently
        // leave the envelope, which makes the downside percentiles recover
        // over time (survivorship bias). In-progress sims that simply ran
        // out of data (no depletedAt) are correctly left out.
        samples.push({ value: 0, weight });
      }
    }
    if (samples.length === 0) continue;
    bands.push({ t, values: bandValues(samples) });
  }
  return bands;
}

/**
 * Lowest balance touched across every year of every sim — the closest any
 * sequence came to depletion, whether mid-retirement or at the very end.
 * Scans all sims including in-progress ones; a minimum (unlike an average)
 * isn't skewed by truncated trajectories. 0 if any sequence depletes.
 * NaN when there are no sims with trajectory data.
 */
export function minBalanceReached(sims: SimulationResult[]): number {
  let min = Infinity;
  for (const s of sims) {
    for (const rec of s.trajectory) {
      if (rec.balance < min) min = rec.balance;
    }
  }
  return Number.isFinite(min) ? min : NaN;
}

/**
 * Median of per-sim mean annual withdrawals, computed over completed observed
 * sims only. Bootstrap samples are excluded (each start year would otherwise
 * be counted samplesPerPrefix times). In-progress sims are excluded because
 * their trajectories are truncated and would understate the average.
 */
export function avgAnnualWithdrawal(sims: SimulationResult[]): number {
  const means: number[] = [];
  for (const s of sims) {
    if (s.bootstrapped || s.inProgress) continue;
    if (s.trajectory.length === 0) continue;
    const sum = s.trajectory.reduce((acc, r) => acc + r.withdrawal, 0);
    means.push(sum / s.trajectory.length);
  }
  if (means.length === 0) return NaN;
  means.sort((a, b) => a - b);
  return quantile(means, 0.5);
}

export type SpendingStats = {
  /** Lowest single-year spending across observed completed cohorts (real $). */
  minAnnualSpend: number;
  /** Cohort and year-into-retirement where that low occurred. */
  minSpendStartYear?: number;
  minSpendAtYear?: number;
  /** Largest year-over-year spending cut (fraction of the prior year). 0 = spending never dropped. */
  worstCut: number;
  worstCutStartYear?: number;
  /** Median across cohorts of total lifetime spending (real $). */
  p50LifetimeSpend: number;
};

/**
 * Spending-quality stats — the honest companion to the success rate for
 * variable-withdrawal strategies, which can "succeed" by quietly gutting
 * spending. Computed over observed completed cohorts only (same exclusions
 * as avgAnnualWithdrawal): bootstrap samples would multiply-count recent
 * cohorts and truncated sims would understate lifetime totals. Spending in
 * a depleted cohort is measured up to depletion — the failure itself is the
 * success rate's job to report.
 */
export function spendingStats(sims: SimulationResult[]): SpendingStats {
  let minSpend = Infinity;
  let minSpendStartYear: number | undefined;
  let minSpendAtYear: number | undefined;
  let worstCut = 0;
  let worstCutStartYear: number | undefined;
  const totals: number[] = [];
  for (const s of sims) {
    if (s.bootstrapped || s.inProgress) continue;
    if (s.trajectory.length === 0) continue;
    let total = 0;
    let prev: number | null = null;
    for (const rec of s.trajectory) {
      total += rec.withdrawal;
      if (rec.withdrawal < minSpend) {
        minSpend = rec.withdrawal;
        minSpendStartYear = s.startYear;
        minSpendAtYear = rec.t;
      }
      if (prev != null && prev > 0) {
        const cut = (prev - rec.withdrawal) / prev;
        if (cut > worstCut) {
          worstCut = cut;
          worstCutStartYear = s.startYear;
        }
      }
      prev = rec.withdrawal;
    }
    totals.push(total);
  }
  totals.sort((a, b) => a - b);
  return {
    minAnnualSpend: Number.isFinite(minSpend) ? minSpend : NaN,
    minSpendStartYear,
    minSpendAtYear,
    worstCut,
    worstCutStartYear,
    p50LifetimeSpend: totals.length > 0 ? quantile(totals, 0.5) : NaN,
  };
}

export type SuccessStats = {
  /** Rate over fully-observed completed cohorts. NaN if there are none. */
  observedRate: number;
  /** Count of fully-observed completed cohorts. */
  completedCount: number;
  /** Count of truncate-mode in-progress cohorts (no projection). */
  inProgressCount: number;
  /**
   * Rate over bootstrap cohorts, each start year weighted equally via the
   * per-sim `weight`. Undefined when there are no bootstrap sims.
   */
  projectedRate?: number;
  /** Number of distinct start years represented by bootstrap cohorts. */
  projectedCohortCount: number;
};

/**
 * Split success into a hard observed rate and a separate bootstrap-projected
 * rate. Observed cohorts are counted 1 sim = 1 start year. Bootstrap cohorts
 * are weighted by each sim's `weight` (1/samplesPerPrefix) so a cohort's many
 * tail samples collapse to a single start year — without this, recent start
 * years outvote the entire observed record by the sample multiplier.
 */
export function successStats(sims: SimulationResult[]): SuccessStats {
  let completed = 0;
  let successes = 0;
  let inProgress = 0;
  let projWeight = 0;
  let projSuccessWeight = 0;
  const projCohorts = new Set<number>();
  for (const s of sims) {
    if (s.bootstrapped) {
      const w = s.weight ?? 1;
      projWeight += w;
      if (s.success) projSuccessWeight += w;
      projCohorts.add(s.startYear);
    } else if (s.inProgress) {
      inProgress += 1;
    } else {
      completed += 1;
      if (s.success) successes += 1;
    }
  }
  return {
    observedRate: completed === 0 ? NaN : successes / completed,
    completedCount: completed,
    inProgressCount: inProgress,
    projectedRate: projWeight > 0 ? projSuccessWeight / projWeight : undefined,
    projectedCohortCount: projCohorts.size,
  };
}
