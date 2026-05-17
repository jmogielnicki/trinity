import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState, YearStateRecord } from '../../src/engine/types';

const strat = {
  type: 'vanguardDynamic' as const,
  rate: 0.05,
  ceiling: 0.05,
  floor: -0.025,
};
const initial = 1_000_000;

function state(balance: number, prevWithdrawal?: number): YearState {
  const trajectory: YearStateRecord[] = prevWithdrawal !== undefined
    ? [{
        t: 0,
        calendarYear: 2000,
        balance: 1_000_000,
        withdrawal: prevWithdrawal,
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
        sleeves: { stock: 600_000, bond: 400_000, cash: 0 },
      }]
    : [];
  return { t: trajectory.length, balance, calendarYear: 2001, trajectory, cape: null };
}

describe('vanguardDynamic withdrawal', () => {
  it('returns rate × balance on first year with no prior withdrawal', () => {
    const wd = computeWithdrawal(strat, state(1_000_000), initial, 0);
    expect(wd).toBeCloseTo(50_000, 5);
  });

  it('passes through baseline when change is within bounds', () => {
    // prev = 50k, baseline = 5% × 1_010_000 = 50_500 (+1% change) → within ±5%/2.5%
    const wd = computeWithdrawal(strat, state(1_010_000, 50_000), initial, 0);
    expect(wd).toBeCloseTo(50_500, 5);
  });

  it('caps upside at ceiling × prev when market runs hot', () => {
    // prev = 50k, baseline = 5% × 1_500_000 = 75k (+50%) → capped at 50k × 1.05 = 52.5k
    const wd = computeWithdrawal(strat, state(1_500_000, 50_000), initial, 0);
    expect(wd).toBeCloseTo(52_500, 5);
  });

  it('caps downside at floor × prev when market drops hard', () => {
    // prev = 50k, baseline = 5% × 500k = 25k (-50%) → floored at 50k × 0.975 = 48.75k
    const wd = computeWithdrawal(strat, state(500_000, 50_000), initial, 0);
    expect(wd).toBeCloseTo(48_750, 5);
  });

  it('allows exact ceiling boundary', () => {
    // baseline = prev × 1.05 exactly → should pass through unchanged
    const wd = computeWithdrawal(strat, state(1_050_000, 50_000), initial, 0);
    expect(wd).toBeCloseTo(52_500, 5);
  });

  it('allows exact floor boundary', () => {
    // prev = 50k, baseline = 50k × 0.975 = 48.75k → passes through unchanged
    const wd = computeWithdrawal(strat, state(975_000, 50_000), initial, 0);
    expect(wd).toBeCloseTo(48_750, 5);
  });
});
