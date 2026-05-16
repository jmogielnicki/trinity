import { describe, expect, it } from 'vitest';
import {
  computePercentiles,
  quantile,
  successStats,
  weightedQuantile,
} from '../../src/engine/stats';
import { runScenario } from '../../src/engine/sweep';
import type { SimulationResult, YearStateRecord } from '../../src/engine/types';
import { loadHistoricalFromDisk } from './loadData';

const W = { stock: 1, bond: 0, cash: 0 };
const S = { stock: 0, bond: 0, cash: 0 };

function rec(t: number, balance: number): YearStateRecord {
  return { t, calendarYear: 1900 + t, balance, withdrawal: 0, weights: W, sleeves: S };
}

function survivor(startYear: number, horizon: number, balance: number): SimulationResult {
  return {
    startYear,
    trajectory: Array.from({ length: horizon }, (_, t) => rec(t, balance)),
    success: true,
    inProgress: false,
    bootstrapped: false,
    prefixYears: horizon,
    finalBalance: balance,
  };
}

function depleted(startYear: number, depletedAt: number): SimulationResult {
  const traj = Array.from({ length: depletedAt + 1 }, (_, t) =>
    rec(t, t < depletedAt ? 500 : 0),
  );
  return {
    startYear,
    trajectory: traj,
    success: false,
    inProgress: false,
    bootstrapped: false,
    prefixYears: depletedAt + 1,
    depletedAt,
  };
}

function inProgress(startYear: number, observed: number, balance: number): SimulationResult {
  return {
    startYear,
    trajectory: Array.from({ length: observed }, (_, t) => rec(t, balance)),
    success: false,
    inProgress: true,
    bootstrapped: false,
    prefixYears: observed,
  };
}

function bootstrapSim(
  startYear: number,
  success: boolean,
  weight: number,
): SimulationResult {
  return {
    startYear,
    trajectory: [rec(0, success ? 1000 : 0)],
    success,
    inProgress: false,
    bootstrapped: true,
    prefixYears: 1,
    weight,
  };
}

describe('computePercentiles — depleted sims stay in the band at 0', () => {
  it('keeps failed paths pinned at 0 past their depletion year', () => {
    // 80 cohorts deplete at t=2; 20 survive flat at 1000 through t=10.
    const sims = [
      ...Array.from({ length: 80 }, (_, i) => depleted(1900 + i, 2)),
      ...Array.from({ length: 20 }, (_, i) => survivor(2000 + i, 10, 1000)),
    ];
    const bands = computePercentiles(sims, 10);

    const t8 = bands.find((b) => b.t === 8)!;
    // 80% of paths are dead → p5/p25/p50 must all be 0, not "recovered".
    expect(t8.values.p5).toBe(0);
    expect(t8.values.p25).toBe(0);
    expect(t8.values.p50).toBe(0);
    // The 20 survivors still show up at the top of the band.
    expect(t8.values.p95).toBe(1000);
  });

  it('does not invent 0s for in-progress sims (no depletedAt)', () => {
    // A truncated sim with only 3 observed years must NOT contribute a 0 at
    // later years — we genuinely don't know how it ends.
    const sims = [
      survivor(1950, 10, 1000),
      inProgress(2020, 3, 1000),
    ];
    const bands = computePercentiles(sims, 10);
    const t8 = bands.find((b) => b.t === 8)!;
    // Only the survivor reaches t=8; the band is all-1000, not dragged to 0.
    expect(t8.values.p5).toBe(1000);
    expect(t8.values.p95).toBe(1000);
  });
});

describe('percentile envelope does not recover via survivorship', () => {
  it('p5 is non-increasing once the failure rate exceeds 5%', () => {
    const data = loadHistoricalFromDisk();
    // 6% / 50-50 / 40yr fails in ~70% of cohorts — a brutal stress case.
    const result = runScenario(
      {
        initialBalance: 1_000_000,
        horizonYears: 40,
        allocation: { type: 'static', weights: { stock: 0.5, bond: 0.5, cash: 0 } },
        withdrawal: { type: 'fixedPercent', rate: 0.06 },
        startYearRange: { from: data.start, to: data.end - 40 + 1 },
      },
      data,
    );
    expect(result.successRate).toBeLessThan(0.5);
    const p5 = result.percentiles.map((b) => b.values.p5);
    for (let i = 1; i < p5.length; i++) {
      expect(p5[i]).toBeLessThanOrEqual(p5[i - 1] + 1e-6);
    }
    // With a majority of cohorts depleted, the late-horizon p5 must be 0.
    expect(p5[p5.length - 1]).toBe(0);
  });
});

describe('weightedQuantile', () => {
  it('matches the plain quantile when all weights are equal', () => {
    const vals = [0, 10, 20, 30, 40];
    const pairs = vals.map((value) => ({ value, weight: 1 }));
    for (const q of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
      expect(weightedQuantile(pairs, q)).toBeCloseTo(quantile(vals, q), 9);
    }
  });

  it('lets weight pull the quantile toward the heavy sample', () => {
    // {0:w1, 100:w9}: 90% of the weight sits at 100, so the median is high.
    const heavy = [
      { value: 0, weight: 1 },
      { value: 100, weight: 9 },
    ];
    expect(weightedQuantile(heavy, 0.5)).toBeCloseTo(90, 6);
    // Equal weights would put the median at 50.
    expect(
      weightedQuantile(
        [
          { value: 0, weight: 1 },
          { value: 100, weight: 1 },
        ],
        0.5,
      ),
    ).toBeCloseTo(50, 6);
  });

  it('clamps to the extremes and handles the empty set', () => {
    const pairs = [
      { value: 5, weight: 2 },
      { value: 9, weight: 7 },
    ];
    expect(weightedQuantile(pairs, 0)).toBe(5);
    expect(weightedQuantile(pairs, 1)).toBe(9);
    expect(weightedQuantile([], 0.5)).toBeNaN();
  });
});

describe('successStats — observed and projected kept separate', () => {
  it('excludes bootstrap sims from the observed rate', () => {
    const sims = [
      survivor(1950, 5, 1000), // observed success
      depleted(1951, 2), // observed failure
      bootstrapSim(2020, true, 0.5),
      bootstrapSim(2020, true, 0.5),
    ];
    const s = successStats(sims);
    // Observed rate is 1/2 — the bootstrap successes do not inflate it.
    expect(s.observedRate).toBe(0.5);
    expect(s.completedCount).toBe(2);
  });

  it('equal-weights each start year in the projected rate', () => {
    // Cohort 2020: 2 samples (weight 0.5), 1 success → cohort prob 0.5.
    // Cohort 2021: 4 samples (weight 0.25), 1 success → cohort prob 0.25.
    // Equal-weighted projected rate = (0.5 + 0.25) / 2 = 0.375.
    // A raw sim count would give 2/6 = 0.333 — the weighting is the point.
    const sims = [
      bootstrapSim(2020, true, 0.5),
      bootstrapSim(2020, false, 0.5),
      bootstrapSim(2021, true, 0.25),
      bootstrapSim(2021, false, 0.25),
      bootstrapSim(2021, false, 0.25),
      bootstrapSim(2021, false, 0.25),
    ];
    const s = successStats(sims);
    expect(s.projectedRate).toBeCloseTo(0.375, 9);
    expect(s.projectedCohortCount).toBe(2);
    expect(s.observedRate).toBeNaN();
  });

  it('projectedRate is undefined when no bootstrap tails were used', () => {
    const s = successStats([survivor(1950, 5, 1000), inProgress(2022, 3, 1000)]);
    expect(s.projectedRate).toBeUndefined();
    expect(s.inProgressCount).toBe(1);
  });
});

describe('runScenario — bootstrap mode does not pollute the observed rate', () => {
  it('reports the same observed rate as truncate, plus a separate projection', () => {
    const data = loadHistoricalFromDisk();
    const base = {
      initialBalance: 1_000_000,
      horizonYears: 50,
      allocation: { type: 'static' as const, weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      withdrawal: { type: 'fixedPercent' as const, rate: 0.04 },
    };
    const truncate = runScenario({ ...base, tailMethod: { type: 'truncate' } }, data);
    const bootstrap = runScenario(
      { ...base, tailMethod: { type: 'bootstrap', blockYears: 7, samplesPerPrefix: 100 } },
      data,
    );

    // The observed rate is a historical fact — identical under both modes,
    // and computed over the same observed cohorts.
    expect(bootstrap.successRate).toBe(truncate.successRate);
    expect(bootstrap.completedCount).toBe(truncate.completedCount);
    // Truncate has no projection; bootstrap reports one separately.
    expect(truncate.projectedSuccessRate).toBeUndefined();
    expect(bootstrap.projectedSuccessRate).toBeGreaterThan(0);
    expect(bootstrap.projectedSuccessRate).toBeLessThanOrEqual(1);
    expect(bootstrap.projectedCohortCount).toBe(truncate.inProgressCount);
  });
});
