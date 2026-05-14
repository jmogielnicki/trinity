import { describe, expect, it } from 'vitest';
import {
  generateCandidates,
  metricsFromResult,
  paretoFront,
  type CandidateResult,
} from '../../src/engine/optimize';
import type { ScenarioResult, SimulationResult } from '../../src/engine/types';

function mkResult(
  id: string,
  successRate: number,
  p50Final: number,
  p95Final: number,
  avgAnnualWithdrawal = 40_000,
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
      avgAnnualWithdrawal,
      avgYearsNearDepletion: 0,
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

function fakeSim(
  trajectory: Array<{ balance: number; withdrawal: number }>,
  success = true,
): SimulationResult {
  return {
    startYear: 2000,
    inProgress: false,
    bootstrapped: false,
    prefixYears: 0,
    success,
    finalBalance: trajectory[trajectory.length - 1]?.balance ?? 0,
    trajectory: trajectory.map((r, t) => ({
      t,
      calendarYear: 2000 + t,
      balance: r.balance,
      withdrawal: r.withdrawal,
      weights: { stock: 0.6, bond: 0.4, cash: 0 },
      sleeves: { stock: 0, bond: 0, cash: 0 },
    })),
  };
}

describe('metricsFromResult', () => {
  it('computes avg annual withdrawal and near-depletion years across completed sims', () => {
    // Sim A: never near depletion (1M → 900k → 800k), withdraws 40k/y
    const a = fakeSim([
      { balance: 900_000, withdrawal: 40_000 },
      { balance: 800_000, withdrawal: 40_000 },
    ]);
    // Sim B: dips below 25% (250k threshold) for 2 of 2 years, withdraws 50k/y
    const b = fakeSim([
      { balance: 200_000, withdrawal: 50_000 },
      { balance: 100_000, withdrawal: 50_000 },
    ]);
    const result: ScenarioResult = {
      sims: [a, b],
      successRate: 1.0,
      completedCount: 2,
      inProgressCount: 0,
      percentiles: [],
    };
    const m = metricsFromResult(result, 1_000_000);
    // (40k + 50k) / 2 sims = 45k
    expect(m.avgAnnualWithdrawal).toBeCloseTo(45_000, 0);
    // (0 + 2) / 2 = 1.0
    expect(m.avgYearsNearDepletion).toBeCloseTo(1.0, 5);
  });
});
