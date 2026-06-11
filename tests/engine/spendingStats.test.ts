import { describe, expect, it } from 'vitest';
import { spendingStats } from '../../src/engine/stats';
import type { SimulationResult, YearStateRecord } from '../../src/engine/types';

function rec(t: number, withdrawal: number): YearStateRecord {
  return {
    t,
    calendarYear: 1950 + t,
    balance: 1_000_000,
    withdrawal,
    weights: { stock: 0.6, bond: 0.4, cash: 0 },
    sleeves: { stock: 600_000, bond: 400_000, cash: 0 },
  };
}

function sim(
  startYear: number,
  withdrawals: number[],
  flags: Partial<Pick<SimulationResult, 'bootstrapped' | 'inProgress'>> = {},
): SimulationResult {
  return {
    startYear,
    trajectory: withdrawals.map((w, t) => rec(t, w)),
    success: true,
    inProgress: false,
    bootstrapped: false,
    prefixYears: withdrawals.length,
    finalBalance: 1_000_000,
    ...flags,
  };
}

describe('spendingStats', () => {
  it('flat spending: min = the constant, no cut, lifetime = sum', () => {
    const stats = spendingStats([sim(1950, [40_000, 40_000, 40_000])]);
    expect(stats.minAnnualSpend).toBe(40_000);
    expect(stats.worstCut).toBe(0);
    expect(stats.p50LifetimeSpend).toBe(120_000);
    expect(stats.minSpendStartYear).toBe(1950);
  });

  it('finds the deepest single-year cut and the lowest year across cohorts', () => {
    const stats = spendingStats([
      sim(1950, [40_000, 30_000, 45_000]), // cut 25% at t=1
      sim(1960, [50_000, 44_000, 28_000]), // cut 36% at t=2, lowest year 28k
    ]);
    expect(stats.minAnnualSpend).toBe(28_000);
    expect(stats.minSpendStartYear).toBe(1960);
    expect(stats.minSpendAtYear).toBe(2);
    expect(stats.worstCut).toBeCloseTo((44_000 - 28_000) / 44_000, 10);
    expect(stats.worstCutStartYear).toBe(1960);
  });

  it('a spending increase is not a cut', () => {
    const stats = spendingStats([sim(1950, [40_000, 48_000, 50_000])]);
    expect(stats.worstCut).toBe(0);
  });

  it('median lifetime spend across cohorts', () => {
    const stats = spendingStats([
      sim(1950, [10_000, 10_000]), // 20k
      sim(1951, [20_000, 20_000]), // 40k
      sim(1952, [30_000, 30_000]), // 60k
    ]);
    expect(stats.p50LifetimeSpend).toBe(40_000);
  });

  it('ignores bootstrapped and in-progress cohorts', () => {
    const stats = spendingStats([
      sim(1950, [40_000, 40_000]),
      sim(2010, [5_000, 1_000], { bootstrapped: true }),
      sim(2015, [4_000], { inProgress: true }),
    ]);
    expect(stats.minAnnualSpend).toBe(40_000);
    expect(stats.worstCut).toBe(0);
  });

  it('returns NaN-ish empty stats with no usable sims', () => {
    const stats = spendingStats([sim(2015, [4_000], { inProgress: true })]);
    expect(Number.isNaN(stats.minAnnualSpend)).toBe(true);
    expect(Number.isNaN(stats.p50LifetimeSpend)).toBe(true);
    expect(stats.worstCut).toBe(0);
  });
});
