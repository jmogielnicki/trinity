import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/engine/simulate';
import { loadHistoricalFromDisk } from './loadData';

// Cash return data only starts in 1934. A cash sleeve in a pre-1934 sim
// must still be a real, visible holding — it just earns 0% real (tracks
// inflation) until data is available. It must not be folded into bonds,
// and there must be no discontinuity when real cash data kicks in.
describe('cash-data availability boundary', () => {
  const data = loadHistoricalFromDisk();
  const startYear = 1915;
  const horizonYears = 30;
  const returns = Array.from({ length: horizonYears }, (_, i) =>
    data.byYear.get(startYear + i)!,
  );

  it('keeps a visible cash sleeve before 1934 that earns 0% real', () => {
    const result = simulate({
      startYear,
      initialBalance: 1_000_000,
      horizonYears,
      allocation: {
        type: 'static',
        weights: { stock: 0.8, bond: 0.1, cash: 0.1 },
      },
      // No rebalance: cash sleeve drifts but is never refilled, so any
      // change to it before 1934 would have to come from returns.
      withdrawal: { type: 'fixedDollar', amount: 0 },
      withdrawalSource: { type: 'proportional', rebalance: false },
      returns,
    });

    // Cash is a real holding from year 0, not folded into bonds.
    expect(result.trajectory[0]!.sleevesStart!.cash).toBeCloseTo(100_000, 5);

    for (const r of result.trajectory) {
      // Before cash data exists (pre-1934), the cash sleeve earns exactly
      // 0% real — present, but flat.
      if (r.calendarYear < 1934) {
        expect(r.returnBySleeve!.cash).toBeCloseTo(0, 6);
      }
      // The sleeve is always present, never silently dropped.
      expect(r.sleeves.cash).toBeGreaterThan(0);
    }
  });

  it('drains cash first under a waterfall without it vanishing pre-1934', () => {
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

    // Year 0 (1915): the $100k cash sleeve is the first thing tapped.
    expect(result.trajectory[0]!.withdrawalBySleeve!.cash).toBeGreaterThan(0);
  });
});
