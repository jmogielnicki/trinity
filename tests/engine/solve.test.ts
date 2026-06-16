import { describe, expect, it } from 'vitest';
import { runScenario, type Scenario } from '../../src/engine/sweep';
import { solveMaxSafeRate, solveMinBalance } from '../../src/engine/solve';
import { loadHistoricalFromDisk } from './loadData';

const data = loadHistoricalFromDisk();

const BASE: Scenario = {
  initialBalance: 1_000_000,
  horizonYears: 30,
  allocation: { type: 'static', weights: { stock: 0.75, bond: 0.25, cash: 0 } },
  withdrawal: { type: 'fixedPercent', rate: 0.04 },
};

describe('solveMaxSafeRate', () => {
  it('finds a plausible safe rate (3–6%) for 75/25 over 30y at 95%', () => {
    const r = solveMaxSafeRate(BASE, data, 0.95);
    expect(r.status).toBe('solved');
    if (r.status !== 'solved') return;
    expect(r.rate).toBeGreaterThan(0.03);
    expect(r.rate).toBeLessThan(0.06);
    expect(r.successRate).toBeGreaterThanOrEqual(0.95);
  });

  it('the solved rate is the boundary: nudging up drops below target', () => {
    const target = 0.95;
    const r = solveMaxSafeRate(BASE, data, target);
    if (r.status !== 'solved') throw new Error('expected solved');
    // At the solved rate, success meets target...
    const atRate = runScenario(
      { ...BASE, withdrawal: { type: 'fixedPercent', rate: r.rate } },
      data,
    ).successRate;
    expect(atRate).toBeGreaterThanOrEqual(target);
    // ...but a meaningfully higher rate does not.
    const higher = runScenario(
      { ...BASE, withdrawal: { type: 'fixedPercent', rate: r.rate + 0.005 } },
      data,
    ).successRate;
    expect(higher).toBeLessThan(target);
  });

  it('a low target makes even the ceiling clear it (allSucceed)', () => {
    const r = solveMaxSafeRate(BASE, data, 0.0);
    expect(r.status).toBe('allSucceed');
  });

  it('is not applicable to variable strategies', () => {
    const r = solveMaxSafeRate(
      { ...BASE, withdrawal: { type: 'floorAndUpside', floor: 0.03, upsideRate: 0.04 } },
      data,
    );
    expect(r.status).toBe('notApplicable');
  });
});

describe('solveMinBalance', () => {
  const fixedDollar: Scenario = {
    ...BASE,
    withdrawal: { type: 'fixedDollar', amount: 40_000 },
  };

  it('finds a number whose success rate meets the target', () => {
    const r = solveMinBalance(fixedDollar, data, 0.95);
    expect(r.status).toBe('solved');
    if (r.status !== 'solved') return;
    expect(r.balance).toBeGreaterThan(0);
    expect(r.annualSpend).toBe(40_000);
    expect(r.successRate).toBeGreaterThanOrEqual(0.95);
  });

  it('the solved balance is the boundary: a smaller balance fails the target', () => {
    const target = 0.95;
    const r = solveMinBalance(fixedDollar, data, target);
    if (r.status !== 'solved') throw new Error('expected solved');
    const smaller = runScenario(
      { ...fixedDollar, initialBalance: r.balance * 0.9 },
      data,
    ).successRate;
    expect(smaller).toBeLessThan(target);
  });

  it('works on percentage plans by holding their implied spend fixed', () => {
    // fixedPercent 4% of $1M ≡ fixedDollar $40k; both solve to the same number.
    const fromPct = solveMinBalance(BASE, data, 0.95);
    const fromDollar = solveMinBalance(fixedDollar, data, 0.95);
    expect(fromPct.status).toBe('solved');
    if (fromPct.status !== 'solved' || fromDollar.status !== 'solved') return;
    expect(fromPct.annualSpend).toBe(40_000);
    expect(fromPct.balance).toBeCloseTo(fromDollar.balance, 0);
  });

  it('the solved number ties to the safe rate: spend ÷ number ≈ safe rate', () => {
    const num = solveMinBalance(BASE, data, 0.95);
    const rate = solveMaxSafeRate(BASE, data, 0.95);
    if (num.status !== 'solved' || rate.status !== 'solved') {
      throw new Error('expected solved');
    }
    expect(num.annualSpend / num.balance).toBeCloseTo(rate.rate, 2);
  });

  it('zero spending always succeeds at any balance (allSucceed)', () => {
    const r = solveMinBalance(
      { ...fixedDollar, withdrawal: { type: 'fixedDollar', amount: 0 } },
      data,
      0.95,
    );
    expect(r.status).toBe('allSucceed');
  });

  it('is not applicable to variable strategies', () => {
    const r = solveMinBalance(
      { ...BASE, withdrawal: { type: 'floorAndUpside', floor: 0.03, upsideRate: 0.04 } },
      data,
      0.95,
    );
    expect(r.status).toBe('notApplicable');
  });
});
