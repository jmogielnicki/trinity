import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState } from '../../src/engine/types';

function state(balance: number, t = 0): YearState {
  return { t, balance, calendarYear: 2000 + t, trajectory: [] };
}

describe('floorAndUpside withdrawal', () => {
  const strat = {
    type: 'floorAndUpside' as const,
    floor: 0.04,
    gainStep: 0.1,
    bumpPerStep: 0.3,
  };
  const initial = 1_000_000;

  it('returns the floor when balance is below or at initial', () => {
    expect(computeWithdrawal(strat, state(900_000), initial, 0)).toBeCloseTo(40_000, 5);
    expect(computeWithdrawal(strat, state(1_000_000), initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('bumps proportionally as balance rises above initial', () => {
    // +10% balance → +30% withdrawal
    expect(computeWithdrawal(strat, state(1_100_000), initial, 0)).toBeCloseTo(52_000, 5);
    // +20% balance → +60% withdrawal
    expect(computeWithdrawal(strat, state(1_200_000), initial, 0)).toBeCloseTo(64_000, 5);
    // +100% balance → +300% withdrawal
    expect(computeWithdrawal(strat, state(2_000_000), initial, 0)).toBeCloseTo(160_000, 5);
  });

  it('never goes below the floor even with extreme losses', () => {
    expect(computeWithdrawal(strat, state(100_000), initial, 0)).toBeCloseTo(40_000, 5);
  });
});
