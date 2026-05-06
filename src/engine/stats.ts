import type { PercentileBand, SimulationResult } from './types';

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
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
      if (rec) balances.push(rec.balance);
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
