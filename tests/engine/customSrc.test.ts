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

  // A customSrc body can arrive from a shared URL. Network / page-state
  // globals are shadowed so a malicious strategy cannot exfiltrate.
  const probe = (src: string): number =>
    simulate({
      startYear,
      initialBalance: 1_000_000,
      horizonYears: 1,
      allocation: { type: 'static', weights: { stock: 1, bond: 0, cash: 0 } },
      withdrawal: { type: 'customSrc', src },
      returns: returns.slice(0, 1),
    }).trajectory[0].withdrawal;

  it('shadows network and page-state globals inside a customSrc body', () => {
    for (const g of ['fetch', 'XMLHttpRequest', 'window', 'document',
      'globalThis', 'localStorage', 'navigator', 'WebSocket', 'Function']) {
      // Returns 1 only if the global is undefined inside the sandbox.
      expect(probe(`return (typeof ${g}) === 'undefined' ? 1 : 999;`)).toBe(1);
    }
  });

  it('a direct eval inside customSrc still sees the shadowed globals', () => {
    expect(probe("return eval('typeof fetch') === 'undefined' ? 1 : 999;")).toBe(
      1,
    );
  });
});
