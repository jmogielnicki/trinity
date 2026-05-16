import type { PercentileBand, SimulationResult } from './types';

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
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
    const balances: number[] = [];
    for (const s of sims) {
      const rec = s.trajectory[t];
      if (rec) {
        balances.push(rec.balance);
      } else if (s.depletedAt != null) {
        // A depleted sim has no trajectory record past depletedAt. It must
        // stay in the band at 0 — dropping it lets failed paths silently
        // leave the envelope, which makes the downside percentiles recover
        // over time (survivorship bias). In-progress sims that simply ran
        // out of data (no depletedAt) are correctly left out.
        balances.push(0);
      }
    }
    if (balances.length === 0) continue;
    balances.sort((a, b) => a - b);
    bands.push({
      t,
      values: {
        p5: quantile(balances, 0.05),
        p25: quantile(balances, 0.25),
        p50: quantile(balances, 0.5),
        p75: quantile(balances, 0.75),
        p95: quantile(balances, 0.95),
      },
    });
  }
  return bands;
}

export function completedSuccessRate(sims: SimulationResult[]): {
  rate: number;
  completed: number;
  inProgress: number;
} {
  const completed = sims.filter((s) => !s.inProgress);
  const successes = completed.filter((s) => s.success).length;
  return {
    rate: completed.length === 0 ? NaN : successes / completed.length,
    completed: completed.length,
    inProgress: sims.length - completed.length,
  };
}
