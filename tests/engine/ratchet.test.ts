import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState, YearStateRecord } from '../../src/engine/types';

const strat = {
  type: 'ratchet' as const,
  baseRate: 0.04,
  stepSize: 0.10,
  stepBoost: 0.05,
};
const initial = 1_000_000;

function state(balance: number, pastBalances: number[] = []): YearState {
  const trajectory: YearStateRecord[] = pastBalances.map((b, i) => ({
    t: i,
    calendarYear: 2000 + i,
    balance: b,
    withdrawal: 0,
    weights: { stock: 1, bond: 0, cash: 0 },
    sleeves: { stock: b, bond: 0, cash: 0 },
  }));
  return { t: pastBalances.length, balance, calendarYear: 2000 + pastBalances.length, trajectory, cape: null };
}

describe('ratchet withdrawal', () => {
  it('returns baseRate × initial when portfolio has never exceeded initial', () => {
    expect(computeWithdrawal(strat, state(1_000_000), initial, 0)).toBeCloseTo(40_000, 5);
    expect(computeWithdrawal(strat, state(900_000), initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('steps up at each 10% threshold', () => {
    // Balance just above 10% gain → 1 step → 4% × (1 + 0.05×1) = 4.2%
    expect(computeWithdrawal(strat, state(1_100_001), initial, 0)).toBeCloseTo(42_000, 0);
    // Balance just above 20% gain → 2 steps → 4% × (1 + 0.05×2) = 4.4%
    expect(computeWithdrawal(strat, state(1_200_001), initial, 0)).toBeCloseTo(44_000, 0);
    // Balance at exactly 10% → 1 step
    expect(computeWithdrawal(strat, state(1_100_000), initial, 0)).toBeCloseTo(42_000, 0);
  });

  it('permanently locks in the highest step reached via trajectory', () => {
    // Portfolio hit 1.15M in the past, now back to 900k — still 1 step
    const s = state(900_000, [1_000_000, 1_150_000, 1_050_000]);
    expect(computeWithdrawal(strat, s, initial, 0)).toBeCloseTo(42_000, 0);
  });

  it('ratchet tracks the peak, not the current balance', () => {
    // Peak was 1.25M (2 steps) but current is 950k
    const s = state(950_000, [1_050_000, 1_250_000, 1_100_000, 980_000]);
    expect(computeWithdrawal(strat, s, initial, 0)).toBeCloseTo(44_000, 0);
  });

  it('does not ratchet below initial even with high trajectory lows', () => {
    const s = state(500_000, [600_000, 700_000]);
    expect(computeWithdrawal(strat, s, initial, 0)).toBeCloseTo(40_000, 5);
  });

  it('current pre-withdrawal balance counts toward peak', () => {
    // No trajectory yet, but current balance is already at 110% — 1 step
    const s = state(1_100_000, []);
    expect(computeWithdrawal(strat, s, initial, 0)).toBeCloseTo(42_000, 0);
  });
});
