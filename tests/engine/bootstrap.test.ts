import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/engine/sweep';
import { computePercentilesFiltered } from '../../src/engine/stats';
import { loadHistoricalFromDisk } from './loadData';

describe('bootstrap tail mode', () => {
  const data = loadHistoricalFromDisk();

  it('truncate mode: recent retirees produce inProgress sims', () => {
    const result = runScenario(
      {
        initialBalance: 1_000_000,
        horizonYears: 30,
        allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
        withdrawal: { type: 'fixedPercent', rate: 0.04 },
        tailMethod: { type: 'truncate' },
        startYearRange: { from: 2010, to: data.end },
      },
      data,
    );
    expect(result.inProgressCount).toBeGreaterThan(0);
    for (const s of result.sims) {
      expect(s.bootstrapped).toBe(false);
    }
  });

  it('bootstrap mode: each in-progress start year produces samplesPerPrefix sims sharing a prefix', () => {
    const samples = 50;
    const result = runScenario(
      {
        initialBalance: 1_000_000,
        horizonYears: 30,
        allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
        withdrawal: { type: 'fixedPercent', rate: 0.04 },
        tailMethod: { type: 'bootstrap', blockYears: 7, samplesPerPrefix: samples },
        startYearRange: { from: 2010, to: 2010 },
      },
      data,
    );
    expect(result.sims).toHaveLength(samples);
    // All sims share the same prefix (first prefixYears entries identical)
    const first = result.sims[0];
    expect(first.bootstrapped).toBe(true);
    expect(first.prefixYears).toBeLessThan(30);
    for (const s of result.sims.slice(1)) {
      for (let t = 0; t < first.prefixYears; t++) {
        expect(s.trajectory[t].balance).toBeCloseTo(
          first.trajectory[t].balance,
          5,
        );
      }
    }
  });

  it('bootstrap mode is reproducible given a seed', () => {
    const scenario = {
      initialBalance: 1_000_000,
      horizonYears: 40,
      allocation: { type: 'static' as const, weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      withdrawal: { type: 'fixedPercent' as const, rate: 0.04 },
      tailMethod: { type: 'bootstrap' as const, blockYears: 7, samplesPerPrefix: 20 },
      startYearRange: { from: 2010, to: 2010 },
      seed: 42,
    };
    const a = runScenario(scenario, data);
    const b = runScenario(scenario, data);
    expect(a.sims[0].finalBalance).toBeCloseTo(b.sims[0].finalBalance!, 5);
  });
});

describe('computePercentilesFiltered', () => {
  const data = loadHistoricalFromDisk();
  it('excludes inProgress sims so the band reflects completed history only', () => {
    const result = runScenario(
      {
        initialBalance: 1_000_000,
        horizonYears: 30,
        allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
        withdrawal: { type: 'fixedPercent', rate: 0.04 },
        tailMethod: { type: 'truncate' },
      },
      data,
    );
    const band = computePercentilesFiltered(
      result.sims,
      30,
      (s) => !s.inProgress && !s.bootstrapped,
    );
    // At t=29 only completed sims contribute; in-progress retirees were
    // dropped, so the band has the right count of underliers.
    expect(band[29]).toBeDefined();
  });
});
