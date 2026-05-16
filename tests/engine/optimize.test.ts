import { describe, expect, it } from 'vitest';
import {
  generateCandidates,
  paretoFront,
  type CandidateResult,
} from '../../src/engine/optimize';

function mkResult(
  id: string,
  successRate: number,
  p50Final: number,
  p95Final: number,
): CandidateResult {
  return {
    candidate: {
      id,
      label: id,
      allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      params: { withdrawal: '4%', allocation: '60/40' },
    },
    metrics: {
      successRate,
      p5Final: p50Final * 0.5,
      p50Final,
      p95Final,
      avgWithdrawal: 40_000,
      minBalance: p50Final * 0.3,
      completedCount: 100,
    },
  };
}

describe('paretoFront', () => {
  it('keeps non-dominated points and drops dominated ones', () => {
    const a = mkResult('A', 1.0, 1_000_000, 5_000_000); // dominates C
    const b = mkResult('B', 0.8, 3_000_000, 8_000_000); // tradeoff vs A
    const c = mkResult('C', 0.9, 500_000, 4_000_000);  // dominated by A on all 3
    const d = mkResult('D', 0.7, 2_000_000, 6_000_000); // dominated by B
    const front = paretoFront([a, b, c, d]);
    const ids = front.map((r) => r.candidate.id).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  it('handles all-equal points by keeping all of them', () => {
    const a = mkResult('A', 0.9, 1_000_000, 5_000_000);
    const b = mkResult('B', 0.9, 1_000_000, 5_000_000);
    const front = paretoFront([a, b]);
    expect(front).toHaveLength(2);
  });

  it('skips points with non-finite successRate', () => {
    const a = mkResult('A', NaN, 1_000_000, 5_000_000);
    const b = mkResult('B', 0.8, 500_000, 3_000_000);
    const front = paretoFront([a, b]);
    expect(front.map((r) => r.candidate.id)).toEqual(['B']);
  });
});

describe('generateCandidates', () => {
  it('produces a non-trivial candidate space with unique ids', () => {
    const cands = generateCandidates();
    expect(cands.length).toBeGreaterThan(50);
    const ids = new Set(cands.map((c) => c.id));
    expect(ids.size).toBe(cands.length);
  });
});
