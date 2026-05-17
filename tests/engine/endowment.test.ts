import { describe, expect, it } from 'vitest';
import { computeWithdrawal } from '../../src/engine/strategies';
import type { YearState, YearStateRecord } from '../../src/engine/types';

const strat = {
  type: 'endowment' as const,
  rate: 0.05,
  lookbackYears: 10,
  floorFraction: 0.90,
};
const initial = 1_000_000;

function makeRecord(balance: number, withdrawal: number, t: number): YearStateRecord {
  return {
    t,
    calendarYear: 2000 + t,
    balance,
    withdrawal,
    weights: { stock: 0.6, bond: 0.4, cash: 0 },
    sleeves: { stock: balance * 0.6, bond: balance * 0.4, cash: 0 },
  };
}

function state(balance: number, past: { balance: number; withdrawal: number }[] = []): YearState {
  return {
    t: past.length,
    balance,
    calendarYear: 2000 + past.length,
    trajectory: past.map((p, i) => makeRecord(p.balance, p.withdrawal, i)),
    cape: null,
  };
}

describe('endowment withdrawal', () => {
  it('uses current balance as average when there is no trajectory', () => {
    const wd = computeWithdrawal(strat, state(1_000_000), initial, 0);
    expect(wd).toBeCloseTo(50_000, 5);
  });

  it('averages over the lookback window', () => {
    const past = [
      { balance: 800_000, withdrawal: 40_000 },
      { balance: 1_000_000, withdrawal: 50_000 },
      { balance: 1_200_000, withdrawal: 60_000 },
    ];
    // avg of [800k, 1000k, 1200k] = 1000k → 5% = 50k; floor = 0.9 × 60k = 54k
    const wd = computeWithdrawal(strat, state(1_100_000, past), initial, 0);
    expect(wd).toBeCloseTo(54_000, 5);
  });

  it('does not apply floor on the first year (no prev withdrawal)', () => {
    const wd = computeWithdrawal(strat, state(500_000), initial, 0);
    expect(wd).toBeCloseTo(25_000, 5);
  });

  it('enforces the floor when rolling-average-based target would cut too deep', () => {
    const past = [
      { balance: 2_000_000, withdrawal: 100_000 },
      { balance: 400_000, withdrawal: 90_000 },  // big crash
    ];
    // avg of [2M, 400k] = 1.2M → 5% = 60k; floor = 0.9 × 90k = 81k → floor wins
    const wd = computeWithdrawal(strat, state(400_000, past), initial, 0);
    expect(wd).toBeCloseTo(81_000, 5);
  });

  it('caps lookback at lookbackYears most recent records', () => {
    // 12 past entries; only last 10 should count
    const past = Array.from({ length: 12 }, (_, i) => ({
      balance: i < 2 ? 2_000_000 : 1_000_000,
      withdrawal: 50_000,
    }));
    // If lookback is correctly capped at 10, all 10 records have balance 1M → avg 1M → 50k
    const wd = computeWithdrawal(strat, state(1_000_000, past), initial, 0);
    expect(wd).toBeCloseTo(50_000, 5);
  });
});
