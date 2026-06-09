import { describe, expect, it } from 'vitest';
import { cashflowAt, incomeAt } from '../../src/engine/cashflows';
import { simulate, type SimulateInput } from '../../src/engine/simulate';
import { runScenario } from '../../src/engine/sweep';
import type { AnnualReturns } from '../../src/engine/types';
import { loadHistoricalFromDisk } from './loadData';

function flatReturns(startYear: number, n: number, v = 0): AnnualReturns[] {
  return Array.from({ length: n }, (_, i) => ({
    year: startYear + i,
    stock_return_nominal: v,
    stock_return_real: v,
    bond_return_nominal: v,
    bond_return_real: v,
    cash_return_nominal: v,
    cash_return_real: v,
    cpi: 100,
    inflation: 0,
    cape: null,
  }));
}

function baseInput(overrides: Partial<SimulateInput>): SimulateInput {
  return {
    startYear: 2000,
    initialBalance: 100_000,
    horizonYears: 5,
    allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
    withdrawal: { type: 'fixedDollar', amount: 40_000 },
    returns: flatReturns(2000, 5),
    ...overrides,
  };
}

describe('incomeAt / cashflowAt', () => {
  it('respects start and (inclusive) end years', () => {
    const incomes = [{ annual: 10_000, startsAtYear: 3, endsAtYear: 5 }];
    expect(incomeAt(incomes, 2)).toBe(0);
    expect(incomeAt(incomes, 3)).toBe(10_000);
    expect(incomeAt(incomes, 5)).toBe(10_000);
    expect(incomeAt(incomes, 6)).toBe(0);
  });

  it('sums overlapping streams and ignores non-positive amounts', () => {
    const incomes = [
      { annual: 10_000, startsAtYear: 0 },
      { annual: 5_000, startsAtYear: 0 },
      { annual: -1_000, startsAtYear: 0 },
    ];
    expect(incomeAt(incomes, 0)).toBe(15_000);
    expect(incomeAt(undefined, 0)).toBe(0);
  });

  it('sums one-time flows at the matching year only', () => {
    const flows = [
      { amount: -50_000, atYear: 3 },
      { amount: 20_000, atYear: 3 },
      { amount: 100_000, atYear: 4 },
    ];
    expect(cashflowAt(flows, 2)).toBe(0);
    expect(cashflowAt(flows, 3)).toBe(-30_000);
    expect(cashflowAt(flows, 4)).toBe(100_000);
    expect(cashflowAt(undefined, 4)).toBe(0);
  });
});

describe('simulate with external cash flows', () => {
  it('income fully covering spending leaves the portfolio untouched', () => {
    const res = simulate(
      baseInput({
        incomes: [{ annual: 40_000, startsAtYear: 0 }],
      }),
    );
    expect(res.success).toBe(true);
    for (const rec of res.trajectory) {
      expect(rec.balance).toBeCloseTo(100_000, 6);
      expect(rec.withdrawal).toBeCloseTo(40_000, 6);
      expect(rec.income).toBeCloseTo(40_000, 6);
    }
  });

  it('income delays depletion by shrinking the net draw', () => {
    // Without income: 100k - 40k/yr depletes in year 2.
    const without = simulate(baseInput({ horizonYears: 12, returns: flatReturns(2000, 12) }));
    expect(without.success).toBe(false);
    expect(without.depletedAt).toBe(2);

    // With 31k income the portfolio only funds 9k/yr → lasts to year 11.
    const withIncome = simulate(
      baseInput({
        horizonYears: 14,
        returns: flatReturns(2000, 14),
        incomes: [{ annual: 31_000, startsAtYear: 0 }],
      }),
    );
    expect(withIncome.success).toBe(false);
    expect(withIncome.depletedAt).toBe(11);
    expect(withIncome.trajectory[11].income).toBeCloseTo(31_000, 6);
  });

  it('invests surplus income back into the portfolio', () => {
    const res = simulate(
      baseInput({
        withdrawal: { type: 'fixedDollar', amount: 20_000 },
        incomes: [{ annual: 50_000, startsAtYear: 0 }],
      }),
    );
    expect(res.success).toBe(true);
    // 30k surplus deposited each year at 0% returns.
    expect(res.finalBalance).toBeCloseTo(100_000 + 5 * 30_000, 6);
  });

  it('one-time expenses and inflows hit the balance in their year', () => {
    const res = simulate(
      baseInput({
        withdrawal: { type: 'fixedDollar', amount: 0 },
        cashflows: [
          { amount: -50_000, atYear: 1 },
          { amount: 80_000, atYear: 3 },
        ],
      }),
    );
    expect(res.trajectory[0].balance).toBeCloseTo(100_000, 6);
    expect(res.trajectory[1].balance).toBeCloseTo(50_000, 6);
    expect(res.trajectory[1].oneTime).toBeCloseTo(-50_000, 6);
    expect(res.trajectory[3].balance).toBeCloseTo(130_000, 6);
    expect(res.trajectory[3].oneTime).toBeCloseTo(80_000, 6);
  });

  it('a delayed income stream (Social Security) kicks in mid-retirement', () => {
    const res = simulate(
      baseInput({
        initialBalance: 200_000,
        horizonYears: 8,
        returns: flatReturns(2000, 8),
        withdrawal: { type: 'fixedDollar', amount: 40_000 },
        incomes: [{ annual: 40_000, startsAtYear: 3 }],
      }),
    );
    expect(res.success).toBe(true);
    // Years 0-2 draw 40k each; from year 3 the income covers spending.
    expect(res.trajectory[2].balance).toBeCloseTo(80_000, 6);
    expect(res.trajectory[7].balance).toBeCloseTo(80_000, 6);
  });

  it('a $0 portfolio fully funded by income is not a failure', () => {
    const res = simulate(
      baseInput({
        initialBalance: 0,
        withdrawal: { type: 'fixedDollar', amount: 40_000 },
        incomes: [{ annual: 50_000, startsAtYear: 0 }],
      }),
    );
    expect(res.success).toBe(true);
    // 10k/yr surplus seeds the portfolio at the target 60/40 weights.
    expect(res.trajectory[0].balance).toBeCloseTo(10_000, 6);
    expect(res.trajectory[0].sleeves.stock).toBeCloseTo(6_000, 6);
    expect(res.trajectory[0].sleeves.bond).toBeCloseTo(4_000, 6);
  });

  it('no flows leaves results byte-identical to the baseline', () => {
    const a = simulate(baseInput({}));
    const b = simulate(baseInput({ incomes: [], cashflows: [] }));
    expect(b).toEqual(a);
  });
});

describe('runScenario passes flows through', () => {
  it('income lifts the historical success rate', () => {
    const data = loadHistoricalFromDisk();
    const base = {
      initialBalance: 1_000_000,
      horizonYears: 30,
      allocation: {
        type: 'static' as const,
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
      },
      withdrawal: { type: 'fixedPercent' as const, rate: 0.055 },
      startYearRange: { from: 1926, to: 1995 },
    };
    const without = runScenario(base, data);
    const withIncome = runScenario(
      // 25k of the 55k spending is covered by income from year 0 on.
      { ...base, incomes: [{ annual: 25_000, startsAtYear: 0 }] },
      data,
    );
    expect(without.successRate).toBeLessThan(1);
    expect(withIncome.successRate).toBeGreaterThan(without.successRate);
    expect(withIncome.successRate).toBe(1);
  });
});
