import { describe, expect, it } from 'vitest';
import { runSweep } from '../../src/engine/sweepRunner';
import { loadHistoricalFromDisk } from './loadData';

describe('sweep runner', () => {
  const data = loadHistoricalFromDisk();
  const base = {
    initialBalance: 1_000_000,
    horizonYears: 30,
    allocation: {
      type: 'static' as const,
      weights: { stock: 0.6, bond: 0.4, cash: 0 },
    },
    withdrawal: { type: 'fixedPercent' as const, rate: 0.04 },
  };

  it('1D sweep over withdrawal rate produces monotonically falling success', () => {
    const grid = runSweep(
      base,
      {
        withdrawalRate: { mode: 'sweep', from: 0.03, to: 0.06, step: 0.005 },
        stockPct: { mode: 'pin' },
        horizon: { mode: 'pin' },
      },
      data,
    );
    const rates = grid.cells.map((c) => c.result.successRate);
    // 3% should succeed in basically every history; 6% should fail in many.
    expect(rates[0]).toBeGreaterThan(0.95);
    expect(rates[rates.length - 1]).toBeLessThan(rates[0]);
  });

  it('2D sweep produces axes.length === 2 and a full grid', () => {
    const grid = runSweep(
      base,
      {
        withdrawalRate: { mode: 'sweep', from: 0.03, to: 0.05, step: 0.01 },
        stockPct: { mode: 'sweep', from: 0.4, to: 0.8, step: 0.2 },
        horizon: { mode: 'pin' },
      },
      data,
    );
    expect(grid.axes).toHaveLength(2);
    // 3 withdrawal × 3 stock = 9 cells
    expect(grid.cells).toHaveLength(9);
  });
});
