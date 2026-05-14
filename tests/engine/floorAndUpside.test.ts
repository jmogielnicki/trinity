import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState } from '../../src/engine/types';

function state(balance: number, t = 0): YearState {
  return { t, balance, calendarYear: 2000 + t, trajectory: [] };
}

describe('floorAndUpside withdrawal', () => {
  // 4% floor + 12¢ per $ above initial.
  const strat = {
    type: 'floorAndUpside' as const,
    floor: 0.04,
    marginalSpend: 0.12,
  };
  const initial = 1_000_000;

  it('returns the floor when balance is below or at initial', () => {
    expect(computeWithdrawal(strat, state(900_000), initial, 0)).toBeCloseTo(40_000, 5);
    expect(computeWithdrawal(strat, state(1_000_000), initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('adds marginalSpend cents for every excess dollar', () => {
    // +100k balance → +12k withdrawal → 52k
    expect(computeWithdrawal(strat, state(1_100_000), initial, 0)).toBeCloseTo(52_000, 5);
    // +1M balance → +120k withdrawal → 160k
    expect(computeWithdrawal(strat, state(2_000_000), initial, 0)).toBeCloseTo(160_000, 5);
  });

  it('never goes below the floor even with extreme losses', () => {
    expect(computeWithdrawal(strat, state(100_000), initial, 0)).toBeCloseTo(40_000, 5);
  });
});
