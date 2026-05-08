import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import type { AnnualReturns } from '../../src/engine/types';
import { loadHistoricalFromDisk } from './loadData';

const WEIGHTS = { stock: 0.5, bond: 0.4, cash: 0.1 };

function flatReturns(
  startYear: number,
  n: number,
  v: { s: number; b: number; c: number; inf?: number },
): AnnualReturns[] {
  const inf = v.inf ?? 0;
  return Array.from({ length: n }, (_, i) => ({
    year: startYear + i,
    stock_return_nominal: v.s,
    stock_return_real: v.s,
    bond_return_nominal: v.b,
    bond_return_real: v.b,
    cash_return_nominal: v.c,
    cash_return_real: v.c,
    cpi: 100,
    inflation: inf,
  }));
}

describe('waterfall withdrawal source', () => {
  it('drains cash before bonds before stocks', () => {
    // 10y of zero returns to keep arithmetic clean. With 50/40/10 of $1M,
    // sleeves start at 500k / 400k / 100k. Withdrawing $40k/yr should empty
    // cash in 3 years (40k * 2 = 80k taken from cash, year 3 takes the
    // remaining 20k from cash + 20k from bonds), then continue draining
    // bonds.
    const returns = flatReturns(2000, 10, { s: 0, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 10,
      allocation: { type: 'static', weights: WEIGHTS },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'waterfall',
        order: ['cash', 'bond', 'stock'],
      },
      returns,
    });

    expect(result.success).toBe(true);
    // Year 0 (after returns): cash drops 40k → 60k, others unchanged.
    expect(result.trajectory[0].sleeves.cash).toBeCloseTo(60_000, 5);
    expect(result.trajectory[0].sleeves.bond).toBeCloseTo(400_000, 5);
    expect(result.trajectory[0].sleeves.stock).toBeCloseTo(500_000, 5);
    // Year 2: cash at 0, bond starts taking the hit.
    // y0: cash 60k, y1: cash 20k, y2: 20k cash + 20k bond → cash 0, bond 380k.
    expect(result.trajectory[2].sleeves.cash).toBeCloseTo(0, 5);
    expect(result.trajectory[2].sleeves.bond).toBeCloseTo(380_000, 5);
    expect(result.trajectory[2].sleeves.stock).toBeCloseTo(500_000, 5);
    // Stock sleeve untouched until cash + bonds are gone.
    expect(result.trajectory[9].sleeves.stock).toBeCloseTo(500_000, 5);
  });

  it('beats proportional in a stocks-down / cash-flat scenario', () => {
    // First 3 years: stocks -20% real, bonds -10%, cash +0%. Then 7 years
    // of recovery (+15% / +5% / 0). Waterfall preserves stocks during the
    // crash, so it has more left to recover.
    const stress = flatReturns(2000, 3, { s: -0.2, b: -0.1, c: 0 });
    const recovery = flatReturns(2003, 7, { s: 0.15, b: 0.05, c: 0 });
    const returns = [...stress, ...recovery];

    const common = {
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 10,
      allocation: { type: 'static' as const, weights: WEIGHTS },
      withdrawal: { type: 'fixedDollar' as const, amount: 40_000 },
      returns,
    };

    const waterfall = simulate({
      ...common,
      withdrawalSource: {
        type: 'waterfall',
        order: ['cash', 'bond', 'stock'],
      },
    });
    const proportional = simulate({
      ...common,
      withdrawalSource: { type: 'proportional', rebalance: true },
    });

    expect(waterfall.finalBalance!).toBeGreaterThan(proportional.finalBalance!);
  });
});

describe('proportional + rebalance preserves the old whole-portfolio result', () => {
  // The default (proportional + rebalance:true) is what the engine used to do
  // implicitly: deduct the withdrawal from total and apply weighted return.
  // Run a real historical scenario both ways and check totals match.
  const data = loadHistoricalFromDisk();

  it('60/40 4% Bengen scenario produces identical balances year-over-year', () => {
    const returns: AnnualReturns[] = [];
    for (let y = 1990; y < 2020; y++) returns.push(data.byYear.get(y)!);

    const result = simulate({
      startYear: 1990,
      initialBalance: 1_000_000,
      horizonYears: 30,
      allocation: {
        type: 'static',
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      returns,
    });

    // Replicate the old scalar formula and compare year by year.
    let bal = 1_000_000;
    for (let t = 0; t < 30; t++) {
      const r = returns[t];
      bal -= 0.04 * 1_000_000;
      bal *= 1 + 0.6 * r.stock_return_real + 0.4 * r.bond_return_real;
      expect(result.trajectory[t].balance).toBeCloseTo(bal, 5);
    }
  });
});

describe('proportional without rebalance lets sleeves drift', () => {
  it('after a stocks-down year, stock fraction has fallen', () => {
    // 50/50 stocks/bonds, stocks lose 20%, bonds flat. With rebalance off,
    // the stock sleeve shrinks more than the bond sleeve, so its share of
    // the total drops below 50%.
    const returns = flatReturns(2000, 1, { s: -0.2, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.5, cash: 0 },
      },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: { type: 'proportional', rebalance: false },
      returns,
    });

    const r0 = result.trajectory[0].sleeves;
    const total = r0.stock + r0.bond;
    expect(r0.stock / total).toBeLessThan(0.5);
    expect(r0.bond / total).toBeGreaterThan(0.5);
  });

  it('with rebalance on, sleeves snap back to target after the same year', () => {
    const returns = flatReturns(2000, 1, { s: -0.2, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.5, cash: 0 },
      },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      returns,
    });

    const r0 = result.trajectory[0].sleeves;
    const total = r0.stock + r0.bond;
    expect(r0.stock / total).toBeCloseTo(0.5, 5);
    expect(r0.bond / total).toBeCloseTo(0.5, 5);
  });
});
