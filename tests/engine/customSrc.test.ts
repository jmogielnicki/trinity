import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { loadHistoricalFromDisk } from './loadData';

describe('customSrc strategies', () => {
  const data = loadHistoricalFromDisk();
  const startYear = 1970;
  const horizonYears = 10;
  const returns = Array.from({ length: horizonYears }, (_, i) =>
    data.byYear.get(startYear + i)!,
  );

  it('compiles and runs a withdrawal script', () => {
    const result = simulate({
      startYear,
      initialBalance: 1_000_000,
      horizonYears,
      allocation: {
        type: 'static',
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
      },
      withdrawal: { type: 'customSrc', src: 'return 0.04 * initial;' },
      returns,
    });
    // Each year withdraws exactly $40k in real terms.
    for (const r of result.trajectory) {
      expect(r.withdrawal).toBeCloseTo(40_000, 5);
    }
  });

  it('compiles and runs an allocation script', () => {
    const result = simulate({
      startYear,
      initialBalance: 1_000_000,
      horizonYears,
      allocation: {
        type: 'customSrc',
        src: 'return { stock: 1, bond: 0, cash: 0 };',
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      returns,
    });
    expect(result.trajectory[0].weights.stock).toBe(1);
  });
});
