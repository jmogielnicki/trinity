import { describe, expect, it } from 'vitest';
import {
  metricsFromResult,
  paretoFront,
  type CandidateResult,
} from '../../src/engine/optimize';
import {
  DEFAULT_STUDY,
  generateStudy,
  generateStudyCandidates,
  type StudyConfig,
} from '../../src/engine/study';
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
      numericParams: { stockPct: 0.6, withdrawalRate: 0.04 },
    },
    metrics: {
      successRate,
      p5Final: p50Final * 0.5,
      p25Final: p50Final * 0.75,
      p50Final,
      p75Final: p50Final * 1.25,
      p95Final,
      avgAnnualWithdrawal,
      minAnnualSpend: avgAnnualWithdrawal,
      worstCut: 0,
      avgYearsNearDepletion: 0,
      minBalance: p50Final * 0.4,
      completedCount: 100,
    },
    result: {
      sims: [],
      successRate,
      completedCount: 100,
      inProgressCount: 0,
      percentiles: [],
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

describe('generateStudyCandidates', () => {
  it('sweeps the 3D allocation range with the other dimensions pinned', () => {
    const cands = generateStudyCandidates(DEFAULT_STUDY);
    // stock 40-100 step 10 × bond 0-60 step 10 × cash 0-20 step 5, strict
    // sum-to-100% filter. Hand-counted: 3+3+3+3+3+2+1 = 18 valid combos.
    expect(cands.length).toBe(18);
    const ids = new Set(cands.map((c) => c.id));
    expect(ids.size).toBe(cands.length);
    for (const c of cands) {
      expect(c.withdrawal).toEqual(DEFAULT_STUDY.lockedWithdrawal);
      expect(c.withdrawalSource).toEqual(DEFAULT_STUDY.lockedSource);
      // Strict sum-to-1: cash is no longer the residual.
      if (c.allocation.type === 'static') {
        const w = c.allocation.weights;
        expect(w.stock + w.bond + w.cash).toBeCloseTo(1, 4);
        expect(w.cash).toBeGreaterThanOrEqual(0);
      }
    }
    const stockLevels = new Set(
      cands.map((c) => Math.round((c.numericParams.stockPct ?? 0) * 100)),
    );
    // All 7 stock steps appear (each one survives the sum-to-1 filter).
    expect(stockLevels.size).toBe(7);
    // Cash actually varies — at least the 0%, 10%, 20% levels show up.
    const cashLevels = new Set(
      cands.map((c) =>
        c.allocation.type === 'static'
          ? Math.round(c.allocation.weights.cash * 100)
          : -1,
      ),
    );
    expect(cashLevels.has(0)).toBe(true);
    expect(cashLevels.has(10)).toBe(true);
    expect(cashLevels.has(20)).toBe(true);
  });

  it('sweeps a glidepath start stock %', () => {
    const cands = generateStudyCandidates({
      ...DEFAULT_STUDY,
      varying: ['allocation'],
      allocationRange: {
        subMode: 'glide',
        sweep: 'startStock',
        startStock: 0.8,
        endStock: 0.3,
        transitionYears: 25,
        from: 0.5,
        to: 1.0,
        step: 0.1,
      },
    });
    expect(cands.length).toBe(6);
    for (const c of cands) {
      expect(c.allocation.type).toBe('glidepath');
      if (c.allocation.type === 'glidepath') {
        // End stock is pinned across all variants.
        expect(c.allocation.end.stock).toBeCloseTo(0.3, 6);
        expect(c.allocation.transitionYears).toBe(25);
        // Cash held at 0; bond fills the rest of the start weight.
        expect(c.allocation.start.cash).toBe(0);
        expect(c.allocation.start.stock + c.allocation.start.bond).toBeCloseTo(1, 6);
      }
    }
    const startStocks = cands.map((c) =>
      c.allocation.type === 'glidepath'
        ? Math.round(c.allocation.start.stock * 100)
        : -1,
    );
    expect(startStocks).toEqual([50, 60, 70, 80, 90, 100]);
  });

  it('sweeps glide transitionYears (years units, not percent)', () => {
    const cands = generateStudyCandidates({
      ...DEFAULT_STUDY,
      varying: ['allocation'],
      allocationRange: {
        subMode: 'glide',
        sweep: 'transitionYears',
        startStock: 0.8,
        endStock: 0.3,
        transitionYears: 25,
        from: 5,
        to: 30,
        step: 5,
      },
    });
    expect(cands.length).toBe(6);
    const years = cands.map((c) =>
      c.allocation.type === 'glidepath' ? c.allocation.transitionYears : -1,
    );
    expect(years).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it('sweeps a withdrawal family while pinning a floor', () => {
    const study: StudyConfig = {
      ...DEFAULT_STUDY,
      varying: ['withdrawal'],
      withdrawalRange: {
        family: 'floorAndUpside',
        sweep: 'floor',
        floor: 0.0325,
        upsideRate: 0.03,
        from: 0.03,
        to: 0.05,
        step: 0.005,
      },
    };
    const cands = generateStudyCandidates(study);
    expect(cands.length).toBe(5);
    for (const c of cands) {
      expect(c.withdrawal.type).toBe('floorAndUpside');
      if (c.withdrawal.type === 'floorAndUpside') {
        expect(c.withdrawal.upsideRate).toBe(0.03);
      }
    }
  });

  it('sweeps a CAPE withdrawal "a" while pinning "b"', () => {
    const study: StudyConfig = {
      ...DEFAULT_STUDY,
      varying: ['withdrawal'],
      withdrawalRange: {
        family: 'cape',
        sweep: 'a',
        a: 0.0175,
        b: 0.5,
        fallbackCape: 20,
        from: 0.01,
        to: 0.025,
        step: 0.0025,
      },
    };
    const cands = generateStudyCandidates(study);
    expect(cands.length).toBe(7);
    for (const c of cands) {
      expect(c.withdrawal.type).toBe('capeWithdrawal');
      if (c.withdrawal.type === 'capeWithdrawal') {
        expect(c.withdrawal.b).toBe(0.5);
        expect(c.withdrawal.fallbackCape).toBe(20);
      }
    }
  });

  it('sweeps a withdrawal curve via parallel shift', () => {
    const study: StudyConfig = {
      ...DEFAULT_STUDY,
      varying: ['withdrawal'],
      withdrawalRange: {
        family: 'curve',
        sweep: 'shift',
        startRate: 0.035,
        endRate: 0.045,
        transitionYears: 30,
        from: -0.01,
        to: 0.01,
        step: 0.005,
      },
    };
    const cands = generateStudyCandidates(study);
    expect(cands.length).toBe(5);
    for (const c of cands) {
      expect(c.withdrawal.type).toBe('piecewiseLinear');
      if (c.withdrawal.type === 'piecewiseLinear') {
        const [start, end] = c.withdrawal.points;
        // Shift preserves the slope: endRate − startRate = 0.045 − 0.035 = 0.01.
        expect(end.rate - start.rate).toBeCloseTo(0.01, 6);
        expect(start.t).toBe(0);
        expect(end.t).toBe(30);
      }
    }
  });

  it('builds a row-major grid for a 2D study', () => {
    const study: StudyConfig = {
      ...DEFAULT_STUDY,
      varying: ['source', 'withdrawal'],
      sourcePresetIds: ['prop-rebal', 'waterfall'],
      withdrawalRange: {
        family: 'fixedPercent',
        from: 0.03,
        to: 0.05,
        step: 0.01,
      },
    };
    const { candidates, axes } = generateStudy(study);
    // 2 source rows × 3 withdrawal cols.
    expect(axes).toHaveLength(2);
    expect(axes[0].dimension).toBe('source');
    expect(axes[1].dimension).toBe('withdrawal');
    expect(axes[0].ticks).toHaveLength(2);
    expect(axes[1].ticks).toHaveLength(3);
    expect(candidates).toHaveLength(6);
    // Row-major: index = row * cols + col. Row 0 = first source preset.
    expect(candidates[0].withdrawalSource?.type).toBe('proportional');
    expect(candidates[3].withdrawalSource?.type).toBe('waterfall');
  });

  it('races the selected withdrawal-source presets', () => {
    const study: StudyConfig = {
      ...DEFAULT_STUDY,
      varying: ['source'],
      sourcePresetIds: ['prop-rebal', 'waterfall', 'bucket'],
    };
    const cands = generateStudyCandidates(study);
    expect(cands.length).toBe(3);
    expect(cands.map((c) => c.withdrawalSource?.type)).toEqual([
      'proportional',
      'waterfall',
      'bucket',
    ]);
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
    // Lowest year-end balance anywhere: sim B's final year at 100k.
    expect(m.minBalance).toBe(100_000);
  });
});
