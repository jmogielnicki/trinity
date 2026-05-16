import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/engine/sweep';
import { loadHistoricalFromDisk } from './loadData';

/**
 * Trinity Study (Cooley, Hubbard, Walz 1998): 4% withdrawal, 75/25, 30 years,
 * ~95% success rate for 1926+ start years.
 */
describe('Trinity Study 75/25 4%', () => {
  const data = loadHistoricalFromDisk();
  const result = runScenario(
    {
      initialBalance: 1_000_000,
      horizonYears: 30,
      allocation: {
        type: 'static',
        weights: { stock: 0.75, bond: 0.25, cash: 0 },
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      startYearRange: { from: 1926, to: data.end - 30 + 1 },
    },
    data,
  );

  it('hits roughly 95% success (brackets both sides)', () => {
    // Published Trinity result is ~95%. CLAUDE.md §12 requires reproduction
    // within 1–2pp, so bracket tightly: a one-sided lower bound would pass
    // even at 100%, hiding a returns/inflation miscalibration.
    expect(result.successRate).toBeGreaterThanOrEqual(0.92);
    expect(result.successRate).toBeLessThanOrEqual(0.97);
  });
});
