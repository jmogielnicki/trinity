import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState } from '../../src/engine/types';

function state(balance: number, t = 0): YearState {
  return { t, balance, calendarYear: 2000 + t, trajectory: [], cape: null };
}

describe('floorAndUpside withdrawal', () => {
  // 3.25% floor on initial, 3% upside on current balance.
  const strat = {
    type: 'floorAndUpside' as const,
    floor: 0.0325,
    upsideRate: 0.03,
  };
  const initial = 1_000_000;

  it('takes the floor when balance is at or below initial', () => {
    // floor = 32,500; upside = 0.03 × 900k = 27,000 → floor wins
    expect(computeWithdrawal(strat, state(900_000), initial, 0)).toBeCloseTo(32_500, 5);
    // floor = 32,500; upside = 0.03 × 1M = 30,000 → floor wins
    expect(computeWithdrawal(strat, state(1_000_000), initial, 0)).toBeCloseTo(32_500, 5);
  });

  it('takes the upside when balance grows enough', () => {
    // floor = 32,500; upside = 0.03 × 2M = 60,000 → upside wins
    expect(computeWithdrawal(strat, state(2_000_000), initial, 0)).toBeCloseTo(60_000, 5);
  });

  it('crossover point is where upsideRate × balance = floor × initial', () => {
    // crossover: 0.03 × balance = 0.0325 × 1M → balance = 1,083,333
    const crossover = (0.0325 / 0.03) * initial;
    expect(computeWithdrawal(strat, state(crossover), initial, 0)).toBeCloseTo(32_500, 1);
    // just above crossover → upside takes over
    expect(computeWithdrawal(strat, state(crossover + 1000), initial, 0))
      .toBeGreaterThan(32_500);
  });

  it('never goes below the floor even with extreme losses', () => {
    expect(computeWithdrawal(strat, state(100_000), initial, 0)).toBeCloseTo(32_500, 5);
  });
});
