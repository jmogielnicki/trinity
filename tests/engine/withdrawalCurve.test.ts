import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState } from '../../src/engine/types';

function st(t: number, balance = 1_000_000): YearState {
  return { t, balance, calendarYear: 2000 + t, trajectory: [], cape: null };
}

describe('piecewiseLinear withdrawal', () => {
  const strat = {
    type: 'piecewiseLinear' as const,
    points: [
      { t: 0, rate: 0.03 },
      { t: 10, rate: 0.05 },
      { t: 20, rate: 0.04 },
    ],
  };
  const initial = 1_000_000;

  it('matches handle values exactly at control points', () => {
    expect(computeWithdrawal(strat, st(0), initial, 0)).toBeCloseTo(30_000, 5);
    expect(computeWithdrawal(strat, st(10), initial, 0)).toBeCloseTo(50_000, 5);
    expect(computeWithdrawal(strat, st(20), initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('linearly interpolates between control points', () => {
    // Halfway from t=0 (3%) to t=10 (5%) → 4%
    expect(computeWithdrawal(strat, st(5), initial, 0)).toBeCloseTo(40_000, 5);
    // Quarter of the way → 3.5%
    expect(computeWithdrawal(strat, st(2.5), initial, 0)).toBeCloseTo(35_000, 5);
    // Halfway from t=10 (5%) to t=20 (4%) → 4.5%
    expect(computeWithdrawal(strat, st(15), initial, 0)).toBeCloseTo(45_000, 5);
  });

  it('clamps to first/last rate outside the range', () => {
    expect(computeWithdrawal(strat, st(-5), initial, 0)).toBeCloseTo(30_000, 5);
    expect(computeWithdrawal(strat, st(30), initial, 0)).toBeCloseTo(40_000, 5);
  });
});

describe('piecewise (step) withdrawal still works for legacy scenarios', () => {
  const strat = {
    type: 'piecewise' as const,
    pieces: [
      { until: 5, rate: 0.03 },
      { until: 15, rate: 0.05 },
      { until: 30, rate: 0.04 },
    ],
  };
  const initial = 1_000_000;

  it('returns the bucket rate, not an interpolated value', () => {
    expect(computeWithdrawal(strat, st(0), initial, 0)).toBeCloseTo(30_000, 5);
    expect(computeWithdrawal(strat, st(4), initial, 0)).toBeCloseTo(30_000, 5);
    expect(computeWithdrawal(strat, st(5), initial, 0)).toBeCloseTo(50_000, 5); // boundary jumps
    expect(computeWithdrawal(strat, st(14), initial, 0)).toBeCloseTo(50_000, 5);
    expect(computeWithdrawal(strat, st(15), initial, 0)).toBeCloseTo(40_000, 5);
  });
});
