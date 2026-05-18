import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { loadHistoricalFromDisk } from './loadData';

// Regression: a static allocation that spans the year cash-return data
// becomes available (1934) must not see cash "pop in". Pre-1934,
// adjustWeightsForData folds the cash sleeve into bonds; the glide step
// must be computed from raw weights so that boundary isn't mistaken for a
// deliberate allocation shift.
describe('cash-data availability boundary', () => {
  const data = loadHistoricalFromDisk();
  const startYear = 1895;
  const horizonYears = 60;
  const returns = Array.from({ length: horizonYears }, (_, i) =>
    data.byYear.get(startYear + i)!,
  );

  it('static waterfall allocation never accumulates cash when it starts cash=0', () => {
    const result = simulate({
      startYear,
      initialBalance: 1_000_000,
      horizonYears,
      allocation: {
        type: 'static',
        weights: { stock: 0.8, bond: 0.1, cash: 0.1 },
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'waterfall', order: ['cash', 'bond', 'stock'] },
      returns,
    });

    // Cash is folded into bonds before 1934, so the cash sleeve seeds at 0
    // and — being a static allocation — must stay 0 across the 1934/1935
    // boundary rather than having 10% of the portfolio carved into it.
    for (const r of result.trajectory) {
      expect(r.sleeves.cash).toBe(0);
    }
  });
});
