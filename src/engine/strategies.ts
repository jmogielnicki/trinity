import { evalCondition, type Rule } from './rules';
import type { Weights, YearState } from './types';

export type WithdrawalStrategy =
  | { type: 'fixedPercent'; rate: number }
  | { type: 'fixedDollar'; amount: number }
  | { type: 'percentOfBalance'; rate: number }
  | { type: 'piecewise'; pieces: { until: number; rate: number }[] }
  /**
   * Linear-interpolation curve: rate at year t is interpolated between the
   * surrounding control points; outside the range it clamps to the nearest
   * end. This is the strategy WithdrawalCurve emits — what users see when
   * they drag handles is exactly what the engine takes.
   */
  | {
      type: 'piecewiseLinear';
      points: { t: number; rate: number }[];
    }
  | {
      type: 'guardrails';
      base: number;
      floor: number;
      ceiling: number;
      trigger: number;
    }
  | { type: 'ruleBased'; base: number; rules: Rule[] }
  | { type: 'custom'; fn: (state: YearState, initial: number) => number }
  /**
   * Source-string variant of `custom`. Body is the function body of
   * `(state, initial) => number`, returning withdrawal in real $. Survives
   * structured-clone (workers, URL serialization) where `custom` doesn't.
   * Compiled lazily; the call site is responsible for sandboxing if any.
   */
  | { type: 'customSrc'; src: string };

export type AllocationStrategy =
  | { type: 'static'; weights: Weights }
  | {
      type: 'glidepath';
      start: Weights;
      end: Weights;
      transitionYears: number;
    }
  | { type: 'linearDrift'; start: Weights; driftPerYear: Weights }
  | { type: 'ageInBonds'; currentAge: number }
  | { type: 'risingEquity'; start: Weights; end: Weights; years: number }
  | { type: 'ruleBased'; base: Weights; rules: Rule[] }
  | { type: 'custom'; fn: (state: YearState) => Weights }
  | { type: 'customSrc'; src: string };

const wdSrcCache = new Map<string, (state: YearState, initial: number) => number>();
const allocSrcCache = new Map<string, (state: YearState) => Weights>();

function compileWithdrawalSrc(
  src: string,
): (state: YearState, initial: number) => number {
  let fn = wdSrcCache.get(src);
  if (!fn) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function('state', 'initial', src) as (
      state: YearState,
      initial: number,
    ) => number;
    wdSrcCache.set(src, fn);
  }
  return fn;
}

function compileAllocSrc(src: string): (state: YearState) => Weights {
  let fn = allocSrcCache.get(src);
  if (!fn) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function('state', src) as (state: YearState) => Weights;
    allocSrcCache.set(src, fn);
  }
  return fn;
}

export function computeWithdrawal(
  strat: WithdrawalStrategy,
  state: YearState,
  initial: number,
  inflation: number,
): number {
  switch (strat.type) {
    case 'fixedPercent':
      // rate of initial, inflation-adjusted. In real $ terms this is constant.
      return strat.rate * initial;
    case 'fixedDollar':
      return strat.amount;
    case 'percentOfBalance':
      return strat.rate * state.balance;
    case 'piecewise': {
      for (const p of strat.pieces) {
        if (state.t < p.until) return p.rate * initial;
      }
      const last = strat.pieces[strat.pieces.length - 1];
      return last.rate * initial;
    }
    case 'piecewiseLinear': {
      const pts = strat.points;
      if (pts.length === 0) return 0;
      const t = state.t;
      if (t <= pts[0].t) return pts[0].rate * initial;
      if (t >= pts[pts.length - 1].t)
        return pts[pts.length - 1].rate * initial;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (t >= a.t && t <= b.t) {
          const span = b.t - a.t;
          const frac = span === 0 ? 0 : (t - a.t) / span;
          return (a.rate + (b.rate - a.rate) * frac) * initial;
        }
      }
      return pts[pts.length - 1].rate * initial;
    }
    case 'guardrails': {
      // Guyton-Klinger style: start at base*initial in real $, then adjust if
      // current "implied withdrawal rate" (last withdrawal / current balance)
      // strays beyond ±trigger from the original. Bump by ±10% (capped at
      // floor/ceiling fraction of base).
      const baseAmt = strat.base * initial;
      const prev = state.trajectory[state.trajectory.length - 1];
      if (!prev) return baseAmt;
      const prevAmt = prev.withdrawal;
      const impliedRate = prevAmt / state.balance;
      const driftHigh = strat.base * (1 + strat.trigger);
      const driftLow = strat.base * (1 - strat.trigger);
      const ceiling = strat.ceiling * baseAmt;
      const floor = strat.floor * baseAmt;
      if (impliedRate > driftHigh) return Math.max(floor, prevAmt * 0.9);
      if (impliedRate < driftLow) return Math.min(ceiling, prevAmt * 1.1);
      return prevAmt;
    }
    case 'ruleBased': {
      let rate = strat.base;
      for (const r of strat.rules) {
        if (
          evalCondition(r.if, state, initial, inflation) &&
          r.then.type === 'setWithdrawal'
        ) {
          rate = r.then.rate;
        }
      }
      return rate * initial;
    }
    case 'custom':
      return strat.fn(state, initial);
    case 'customSrc':
      return compileWithdrawalSrc(strat.src)(state, initial);
  }
}

function normalize(w: Weights): Weights {
  const s = w.stock + w.bond + w.cash;
  if (s === 0) return { stock: 1, bond: 0, cash: 0 };
  return { stock: w.stock / s, bond: w.bond / s, cash: w.cash / s };
}

function clampWeights(w: Weights): Weights {
  const c = {
    stock: Math.max(0, w.stock),
    bond: Math.max(0, w.bond),
    cash: Math.max(0, w.cash),
  };
  return normalize(c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpWeights(a: Weights, b: Weights, t: number): Weights {
  return {
    stock: lerp(a.stock, b.stock, t),
    bond: lerp(a.bond, b.bond, t),
    cash: lerp(a.cash, b.cash, t),
  };
}

export function computeWeights(
  strat: AllocationStrategy,
  state: YearState,
  initial: number,
  inflation: number,
): Weights {
  switch (strat.type) {
    case 'static':
      return normalize(strat.weights);
    case 'glidepath': {
      const t = Math.min(1, state.t / Math.max(1, strat.transitionYears));
      return normalize(lerpWeights(strat.start, strat.end, t));
    }
    case 'linearDrift':
      return clampWeights({
        stock: strat.start.stock + strat.driftPerYear.stock * state.t,
        bond: strat.start.bond + strat.driftPerYear.bond * state.t,
        cash: strat.start.cash + strat.driftPerYear.cash * state.t,
      });
    case 'ageInBonds': {
      const age = strat.currentAge + state.t;
      const bond = Math.min(1, Math.max(0, age / 100));
      return { stock: 1 - bond, bond, cash: 0 };
    }
    case 'risingEquity': {
      const t = Math.min(1, state.t / Math.max(1, strat.years));
      return normalize(lerpWeights(strat.start, strat.end, t));
    }
    case 'ruleBased': {
      let w = { ...strat.base };
      for (const r of strat.rules) {
        if (
          evalCondition(r.if, state, initial, inflation) &&
          r.then.type === 'shiftAllocation'
        ) {
          w = {
            stock: w.stock + r.then.delta.stock,
            bond: w.bond + r.then.delta.bond,
            cash: w.cash + r.then.delta.cash,
          };
        }
      }
      return clampWeights(w);
    }
    case 'custom':
      return normalize(strat.fn(state));
    case 'customSrc':
      return normalize(compileAllocSrc(strat.src)(state));
  }
}
