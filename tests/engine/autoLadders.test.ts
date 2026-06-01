import { describe, expect, it } from 'vitest';
import {
  AUTO_RATCHET_BOOSTS,
  AUTO_CAPE_RULES,
  autoLadderRungs,
  buildAutoLadderCandidate,
  buildAutoLadders,
  autoSearchSummary,
  type AutoLadder,
} from '../../src/engine/study';

/**
 * Auto-mode ladders: the laddered search structure that replaced the flat
 * candidate grid. These guard the rung math, candidate construction, and the
 * per-pair ladder count — the bits the early-termination worker depends on.
 */
describe('auto-mode ladders', () => {
  const params = { minWithdrawalRate: 0.0325, horizonYears: 30 };

  it('fixed/ratchet rungs climb from the floor to 5% in 0.25% steps', () => {
    const ladder: AutoLadder = {
      allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      source: { type: 'proportional', rebalance: true },
      kind: 'fixed',
      baseRate: 0.0325,
    };
    const rungs = autoLadderRungs(ladder);
    expect(rungs[0]).toBeCloseTo(0.0325, 6);
    expect(rungs[rungs.length - 1]).toBeCloseTo(0.05, 6);
    // 3.25 → 5.00 inclusive @ 0.25 = 8 rungs.
    expect(rungs.length).toBe(8);
  });

  it('curve rungs climb the END rate from floor+step to 6%, skipping the flat dup', () => {
    const ladder: AutoLadder = {
      allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      source: { type: 'proportional', rebalance: true },
      kind: 'curve',
      baseRate: 0.0325,
    };
    const rungs = autoLadderRungs(ladder);
    // First rung is base + 0.25% (the flat end==base case is just fixed-base).
    expect(rungs[0]).toBeCloseTo(0.035, 6);
    expect(rungs[rungs.length - 1]).toBeCloseTo(0.06, 6);
  });

  it('builds one fixed + boosts + one curve + CAPE rules per [allocation, source]', () => {
    const summary = autoSearchSummary(params.horizonYears);
    const perPair = 1 + AUTO_RATCHET_BOOSTS.length + 1 + AUTO_CAPE_RULES.length;
    expect(summary.strategies).toBe(perPair);
    expect(summary.ladders).toBe(summary.allocations * summary.sources * perPair);

    const ladders = buildAutoLadders(params);
    expect(ladders.length).toBe(summary.ladders);
    // Exactly the four requested ratchet boosts, no per-increment sweep.
    expect(AUTO_RATCHET_BOOSTS).toEqual([0.03, 0.05, 0.07, 0.1]);
    const ratchet = ladders.filter((l) => l.kind === 'ratchet');
    expect(ratchet.length).toBe(summary.allocations * summary.sources * AUTO_RATCHET_BOOSTS.length);
    const cape = ladders.filter((l) => l.kind === 'cape');
    expect(cape.length).toBe(summary.allocations * summary.sources * AUTO_CAPE_RULES.length);
  });

  it('CAPE rules are single-rung and build the right capeWithdrawal strategy', () => {
    const base: Omit<AutoLadder, 'kind'> = {
      allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      source: { type: 'proportional', rebalance: true },
      baseRate: 0.0325,
    };
    const rule = AUTO_CAPE_RULES.find((r) => r.label === 'CAPE 1.75/0.5')!;
    const ladder: AutoLadder = { ...base, kind: 'cape', cape: rule };
    // No rate to climb — exactly one rung.
    expect(autoLadderRungs(ladder)).toEqual([0]);

    const cand = buildAutoLadderCandidate(ladder, 0, 30);
    expect(cand.withdrawal).toMatchObject({
      type: 'capeWithdrawal',
      a: 0.0175,
      b: 0.5,
    });
    expect(cand.params.withdrawal).toBe('CAPE 1.75/0.5');

    // Distinct CAPE rules over the same [alloc, source] get distinct ids.
    const other = AUTO_CAPE_RULES.find((r) => r.label === 'CAPE 1.50/0.5')!;
    const cand2 = buildAutoLadderCandidate({ ...base, kind: 'cape', cape: other }, 0, 30);
    expect(cand.id).not.toBe(cand2.id);
  });

  it('builds concrete candidates with distinct ids and informative curve labels', () => {
    const base: Omit<AutoLadder, 'kind'> = {
      allocation: { type: 'static', weights: { stock: 0.6, bond: 0.4, cash: 0 } },
      source: { type: 'proportional', rebalance: true },
      baseRate: 0.0325,
    };
    const fixed = buildAutoLadderCandidate({ ...base, kind: 'fixed' }, 0.04, 30);
    expect(fixed.withdrawal).toEqual({ type: 'fixedPercent', rate: 0.04 });
    expect(fixed.numericParams.withdrawalRate).toBeCloseTo(0.04, 6);

    const ratchet = buildAutoLadderCandidate(
      { ...base, kind: 'ratchet', boost: 0.05 },
      0.04,
      30,
    );
    expect(ratchet.withdrawal).toMatchObject({
      type: 'ratchet',
      baseRate: 0.04,
      stepSize: 0.1,
      stepBoost: 0.05,
    });

    const curveA = buildAutoLadderCandidate({ ...base, kind: 'curve' }, 0.045, 30);
    const curveB = buildAutoLadderCandidate({ ...base, kind: 'curve' }, 0.05, 30);
    // Curve rungs must have distinct ids and labels (describeWithdrawal alone
    // would collapse them to "withdrawal curve").
    expect(curveA.id).not.toBe(curveB.id);
    expect(curveA.params.withdrawal).not.toBe(curveB.params.withdrawal);
    expect(curveA.withdrawal).toMatchObject({ type: 'piecewiseLinear' });
  });
});
