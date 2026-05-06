import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { loadHistoricalFromDisk } from './loadData';

/**
 * The 1966 retiree is the canonical bad-sequence case: 4% / 60-40 fails by
 * about year 25 due to the inflation+stagflation 1970s. Confirms the engine
 * actually exhibits sequence-of-returns risk.
 */
describe('1966 retiree (canonical bad sequence)', () => {
  const data = loadHistoricalFromDisk();
  const startYear = 1966;
  const horizonYears = 30;
  const returns = [];
  for (let y = startYear; y < startYear + horizonYears; y++) {
    returns.push(data.byYear.get(y)!);
  }

  const result = simulate({
    startYear,
    initialBalance: 1_000_000,
    horizonYears,
    allocation: {
      type: 'static',
      weights: { stock: 0.6, bond: 0.4, cash: 0 },
    },
    withdrawal: { type: 'fixedPercent', rate: 0.04 },
    returns,
  });

  it('depletes within the horizon', () => {
    expect(result.success).toBe(false);
    expect(result.depletedAt).toBeDefined();
  });

  it('depletes between years 20 and 30', () => {
    expect(result.depletedAt!).toBeGreaterThanOrEqual(20);
    expect(result.depletedAt!).toBeLessThan(30);
  });
});
