import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/engine/sweep';
import { loadHistoricalFromDisk } from './loadData';

/**
 * Bengen (1994): 4% withdrawal of initial (inflation-adjusted), 50/50
 * stocks/bonds, 30-year horizon, every start year from 1926. Bengen's
 * canonical 100% used 5-year intermediate Treasuries (Ibbotson SBBI). Our
 * Shiller-based bond series is the 10-year constant-maturity Treasury, which
 * carries more duration risk; the 1965-69 retiree cohort takes enough damage
 * from the 1979-82 yield surge to fail. This is consistent with later
 * literature (e.g., Pfau) that re-runs Bengen with long Treasuries and finds
 * SWR drops a notch for that exact cohort. So we expect ≥ 92% here, not 100%.
 */
describe('Bengen 4% rule', () => {
  const data = loadHistoricalFromDisk();
  const result = runScenario(
    {
      initialBalance: 1_000_000,
      horizonYears: 30,
      allocation: { type: 'static', weights: { stock: 0.5, bond: 0.5, cash: 0 } },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      startYearRange: { from: 1926, to: data.end - 30 + 1 },
    },
    data,
  );

  it('runs the expected number of completed sims', () => {
    expect(result.completedCount).toBeGreaterThanOrEqual(60);
    expect(result.inProgressCount).toBe(0);
  });

  it('has ≥ 92% historical success (10y Treasuries)', () => {
    expect(result.successRate).toBeGreaterThanOrEqual(0.92);
  });
});
