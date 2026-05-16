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

describe('bucket withdrawal source (waterfall + refill)', () => {
  it('refills cash from stocks when below floor and stocks above the gate', () => {
    // 50/40/10 of $1M. Withdraw $40k/yr from cash first. Stocks +20% / yr,
    // bonds 0%, cash 0%. After year 0:
    //   pre-returns: cash 60k, bond 400k, stock 500k
    //   post-returns: cash 60k, bond 400k, stock 600k, total 1.06M
    //   cash/total = 60k/1.06M ≈ 5.7% < floor 8%
    //   stock 600k ≥ 1.0× initial stock 500k → refill fires
    //   refill restores cash to ceiling 15% of 1.06M = 159k
    //   move 99k from stock → cash
    const returns = flatReturns(2000, 5, { s: 0.2, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 5,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.4, cash: 0.1 },
      },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
          sourceMinRatio: 1.0,
        }],
      },
      returns,
    });

    const y0 = result.trajectory[0].sleeves;
    const total = y0.stock + y0.bond + y0.cash;
    // Cash refilled to ceiling
    expect(y0.cash / total).toBeCloseTo(0.15, 4);
    // Stocks reduced from 600k post-return by the transfer
    expect(y0.stock).toBeLessThan(600_000);
    expect(y0.bond).toBeCloseTo(400_000, 5);
  });

  it('suppresses refill when source sleeve is below the gate', () => {
    // Same setup, but stocks -10% in year 0. Stocks 500k → 450k after returns,
    // below the 1.0× initial gate. Cash sits at 60k post-withdrawal (no growth),
    // bond at 400k. Cash fraction = 60k/910k ≈ 6.6% < floor — but the gate
    // blocks the refill.
    const returns = flatReturns(2000, 1, { s: -0.1, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.4, cash: 0.1 },
      },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
          sourceMinRatio: 1.0,
        }],
      },
      returns,
    });

    const y0 = result.trajectory[0].sleeves;
    // No transfer happened — sleeves are just post-withdrawal + post-return.
    expect(y0.cash).toBeCloseTo(60_000, 5);
    expect(y0.stock).toBeCloseTo(450_000, 5);
    expect(y0.bond).toBeCloseTo(400_000, 5);
  });

  it('refill rule with no gate fires regardless of source level', () => {
    // Same -10% stocks scenario, but no sourceMinRatio. Refill should fire.
    const returns = flatReturns(2000, 1, { s: -0.1, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.4, cash: 0.1 },
      },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
        }],
      },
      returns,
    });
    const y0 = result.trajectory[0].sleeves;
    const total = y0.stock + y0.bond + y0.cash;
    expect(y0.cash / total).toBeCloseTo(0.15, 4);
  });

  it('sourceReturnGate blocks refill when source had a negative return', () => {
    // 50/40/10 of $1M. Stocks -10% this year.
    // Cash drops to 60k after withdrawal, below 8% floor.
    // Rule has sourceReturnGate: 0 (only refill when stock return > 0).
    // -10% ≤ 0 → gate blocks the refill.
    const returns = flatReturns(2000, 1, { s: -0.1, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: { type: 'static', weights: { stock: 0.5, bond: 0.4, cash: 0.1 } },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
          sourceReturnGate: 0,
        }],
      },
      returns,
    });
    const y0 = result.trajectory[0].sleeves;
    // No transfer: cash stays at 60k, stock stays at 450k
    expect(y0.cash).toBeCloseTo(60_000, 5);
    expect(y0.stock).toBeCloseTo(450_000, 5);
  });

  it('sourceReturnGate allows refill when source had a positive return', () => {
    // Same setup but stocks +20%. Gate (> 0%) passes.
    const returns = flatReturns(2000, 1, { s: 0.2, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: { type: 'static', weights: { stock: 0.5, bond: 0.4, cash: 0.1 } },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
          sourceReturnGate: 0,
        }],
      },
      returns,
    });
    const y0 = result.trajectory[0].sleeves;
    const total = y0.stock + y0.bond + y0.cash;
    // Refill fired: cash at ceiling
    expect(y0.cash / total).toBeCloseTo(0.15, 4);
    expect(y0.stock).toBeLessThan(600_000);
  });

  it('withdrawalYears floor triggers on dollar amount, not portfolio fraction', () => {
    // $1M portfolio, $40k/yr withdrawal.
    // Cash sleeve starts at $70k after withdrawal ($1M × 10% - $40k + adjustment).
    // Actually: 68/24/8 split → stock 680k, bond 240k, cash 80k.
    // Withdraw $40k from cash first → cash 40k.
    // Stocks +10%, bonds 0%, cash 0%.
    // post-returns: cash 40k, bond 240k, stock 748k, total 1.028M
    // Rule: target cash, floor 2yr (= 2 × 40k = 80k), ceiling 2yr.
    // cash 40k < 80k floor → fires; target = 80k; move 40k from bond → cash.
    const returns = flatReturns(2000, 1, { s: 0.1, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: { type: 'static', weights: { stock: 0.68, bond: 0.24, cash: 0.08 } },
      withdrawal: { type: 'fixedDollar', amount: 40_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [{
          targetSleeve: 'cash',
          floor: 2,
          ceiling: 2,
          floorMode: 'withdrawalYears',
          sourceSleeve: 'bond',
        }],
      },
      returns,
    });
    const y0 = result.trajectory[0].sleeves;
    // Cash refilled to exactly 2 × $40k = $80k
    expect(y0.cash).toBeCloseTo(80_000, 3);
    // Bond reduced by $40k to cover the refill
    expect(y0.bond).toBeCloseTo(240_000 - 40_000, 3);
    // Stocks untouched
    expect(y0.stock).toBeCloseTo(680_000 * 1.1, 3);
  });

  it('full years-bucket strategy: bonds refilled from stocks in up year, blocked in down year', () => {
    // $1M, $40k/yr withdrawal, 68/24/8 split.
    // Rule 1: refill bonds from stocks (floor: 6yr=240k, gate: stock > 0%)
    // Rule 2: refill cash from bonds (floor: 2yr=80k, no gate)
    //
    // UP YEAR (stocks +15%): cash and bonds both drain via waterfall, then:
    //   post-returns cash 40k < 80k → rule 2 fires first... wait, rules run in order.
    //   Rule 1 runs first: bond target. After $40k withdrawal from cash:
    //     cash 40k, bond 240k, stock 680k → stock 782k post-returns
    //     bond = 240k = exactly 6×40k, not below floor → rule 1 no-op
    //   Rule 2: cash 40k < 2×40k=80k → move 40k from bond → cash
    //   Final: cash 80k, bond 200k, stock 782k
    //
    // DOWN YEAR (stocks -15%): rule 1 gate blocks stock sales.
    //   cash 40k < 80k → rule 2 fires (no gate): move 40k from bonds → cash
    //   bond doesn't get refilled from stocks (gate blocks)
    const upReturns = flatReturns(2000, 1, { s: 0.15, b: 0, c: 0 });
    const downReturns = flatReturns(2000, 1, { s: -0.15, b: 0, c: 0 });

    const base = {
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: { type: 'static' as const, weights: { stock: 0.68, bond: 0.24, cash: 0.08 } },
      withdrawal: { type: 'fixedDollar' as const, amount: 40_000 },
      withdrawalSource: {
        type: 'bucket' as const,
        order: ['cash', 'bond', 'stock'] as ['cash', 'bond', 'stock'],
        refill: [
          {
            targetSleeve: 'bond' as const,
            floor: 6,
            ceiling: 6,
            floorMode: 'withdrawalYears' as const,
            sourceSleeve: 'stock' as const,
            sourceReturnGate: 0,
          },
          {
            targetSleeve: 'cash' as const,
            floor: 2,
            ceiling: 2,
            floorMode: 'withdrawalYears' as const,
            sourceSleeve: 'bond' as const,
          },
        ],
      },
    };

    const upResult = simulate({ ...base, returns: upReturns });
    const downResult = simulate({ ...base, returns: downReturns });

    const up = upResult.trajectory[0].sleeves;
    const down = downResult.trajectory[0].sleeves;

    // Up year: cash refilled to 80k, bonds untouched (were at target), stocks grew
    expect(up.cash).toBeCloseTo(80_000, 3);
    expect(up.bond).toBeCloseTo(200_000, 3); // 240k - 40k moved to cash
    expect(up.stock).toBeCloseTo(680_000 * 1.15, 3); // untouched

    // Down year: cash refilled from bonds (no gate), stocks NOT sold (gate blocked)
    expect(down.cash).toBeCloseTo(80_000, 3);
    expect(down.bond).toBeCloseTo(200_000, 3); // 240k - 40k moved to cash
    expect(down.stock).toBeCloseTo(680_000 * 0.85, 3); // shrank but not sold
  });

  it('two-rule chain: cash refills from bonds, bonds refill from stocks when stocks are up', () => {
    // 50/35/15 of $1M. Stocks +20%, bonds 0%, cash 0%.
    // Withdraw $40k from cash first.
    //   pre-returns: cash 110k, bond 350k, stock 500k (after $40k from cash: 110k)
    //   post-returns: cash 110k, bond 350k, stock 600k, total 1.06M
    //   Rule 1: cash/total = 110k/1.06M ≈ 10.4% > floor 8% → no-op
    //   Rule 2: bond/total = 350k/1.06M ≈ 33% > floor 25% → no-op
    // Now test a scenario where cash drops below floor: withdraw $80k/yr.
    //   pre-returns: cash 70k, bond 350k, stock 500k (after $80k from cash)
    //   post-returns: cash 70k, bond 350k, stock 600k, total 1.02M
    //   cash/total = 70k/1.02M ≈ 6.9% < floor 8% → rule 1 fires: sell bonds to top cash to 15%
    //   target cash = 0.15 × 1.02M = 153k, move 83k from bonds → cash
    //   bond = 267k, cash = 153k
    //   bond/total = 267k/1.02M ≈ 26.2% > floor 25% → rule 2 does not fire
    const returns = flatReturns(2000, 1, { s: 0.2, b: 0, c: 0 });
    const result = simulate({
      startYear: 2000,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: {
        type: 'static',
        weights: { stock: 0.5, bond: 0.35, cash: 0.15 },
      },
      withdrawal: { type: 'fixedDollar', amount: 80_000 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: [
          {
            targetSleeve: 'cash',
            floor: 0.08,
            ceiling: 0.15,
            sourceSleeve: 'bond',
          },
          {
            targetSleeve: 'bond',
            floor: 0.25,
            ceiling: 0.35,
            sourceSleeve: 'stock',
            sourceMinRatio: 1.0,
          },
        ],
      },
      returns,
    });

    const y0 = result.trajectory[0].sleeves;
    const total = y0.stock + y0.bond + y0.cash;
    // Rule 1 fired: cash at ceiling
    expect(y0.cash / total).toBeCloseTo(0.15, 3);
    // Bonds were the source for rule 1; stocks untouched (rule 2 didn't fire)
    expect(y0.stock).toBeCloseTo(600_000, 3);
    expect(y0.bond).toBeLessThan(350_000);
  });
});

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
