import { describe, expect, it } from 'vitest';
import { minSpendReached } from '../../src/engine/stats';
import type { SimulationResult, YearStateRecord } from '../../src/engine/types';

const W = { stock: 1, bond: 0, cash: 0 };
const S = { stock: 0, bond: 0, cash: 0 };

function rec(t: number, withdrawal: number): YearStateRecord {
  return { t, calendarYear: 1900 + t, balance: 1000, withdrawal, weights: W, sleeves: S };
}

function sim(withdrawals: number[], extra: Partial<SimulationResult> = {}): SimulationResult {
  return {
    startYear: 1900,
    trajectory: withdrawals.map((w, t) => rec(t, w)),
    success: true,
    inProgress: false,
    bootstrapped: false,
    prefixYears: withdrawals.length,
    finalBalance: 1000,
    ...extra,
  };
}

describe('minSpendReached', () => {
  it('is the global minimum single-year withdrawal across all sims and years', () => {
    const sims = [
      sim([40_000, 38_000, 41_000]),
      sim([39_000, 32_500, 50_000]), // 32.5k is the global low (e.g. the floor binding)
      sim([45_000, 44_000]),
    ];
    expect(minSpendReached(sims)).toBe(32_500);
  });

  it('includes in-progress and bootstrapped sims (a min is not skewed by truncation)', () => {
    const sims = [
      sim([40_000, 40_000]),
      sim([30_000], { inProgress: true, prefixYears: 1 }),
      sim([28_000], { bootstrapped: true }),
    ];
    expect(minSpendReached(sims)).toBe(28_000);
  });

  it('returns NaN when no sim has trajectory data', () => {
    expect(minSpendReached([])).toBeNaN();
    expect(minSpendReached([sim([])])).toBeNaN();
  });
});
