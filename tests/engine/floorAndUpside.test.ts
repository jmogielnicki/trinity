import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState } from '../../src/engine/types';

function state(balance: number, t = 0): YearState {
  return { t, balance, calendarYear: 2000 + t, trajectory: [] };
}

describe('floorAndUpside withdrawal', () => {
  // 4% floor + 2¢ per $ above initial ($20k per $1M extra).
  const strat = {
    type: 'floorAndUpside' as const,
    floor: 0.04,
    marginalSpend: 0.02,
  };
  const initial = 1_000_000;

  it('returns the floor when balance is below or at initial', () => {
    expect(computeWithdrawal(strat, state(900_000), initial, 0)).toBeCloseTo(40_000, 5);
    expect(computeWithdrawal(strat, state(1_000_000), initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('adds marginalSpend per excess dollar', () => {
    // +100k balance → +2k withdrawal → 42k
    expect(computeWithdrawal(strat, state(1_100_000), initial, 0)).toBeCloseTo(42_000, 5);
    // +1M balance → +20k withdrawal → 60k
    expect(computeWithdrawal(strat, state(2_000_000), initial, 0)).toBeCloseTo(60_000, 5);
  });

  it('never goes below the floor even with extreme losses', () => {
    expect(computeWithdrawal(strat, state(100_000), initial, 0)).toBeCloseTo(40_000, 5);
  });
});
