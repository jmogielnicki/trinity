import { describe, expect, it } from 'vitest';
import { computePercentiles } from '../../src/engine/stats';
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
