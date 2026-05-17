import { evalCondition, type Rule } from './rules';
import type { Weights, YearState } from './types';

export type WithdrawalStrategy =
  | { type: 'fixedPercent'; rate: number }
  /** Fixed real $/year — constant purchasing power, set independently of the
   *  portfolio size. `amount` is in today's dollars, like every other figure
   *  the engine handles. */
  | { type: 'fixedDollar'; amount: number }
  /**
   * % of current balance, but never less than `floor × initial` (real $).
   * The floor is a fixed spending commitment that does NOT shrink with the
   * portfolio — so a crashed balance can actually be depleted. Without it a
   * pure % of balance can never reach zero, so it "succeeds" trivially in
   * every history and its success rate is meaningless.
   */
  | { type: 'percentOfBalance'; rate: number; floor: number }
  /**
   * Floor + upside: never withdraw less than `floor × initial` (real $), and
   * for every $1 the portfolio is above its starting balance, spend an extra
   * `marginalSpend` cents.
   *
   *   wd = floor × initial + marginalSpend × max(0, balance − initial)
   *
   * Models how real retirees behave: a sticky lifestyle floor that ratchets
   * up if the portfolio runs ahead, without the wild downside of pure
   * percent-of-balance withdrawals. The two-parameter form is the minimal
   * description — any "for every X% gain, bump withdrawal by Y%" formulation
   * reduces to a single marginal-spend coefficient.
   */
  | {
      type: 'floorAndUpside';
      floor: number;
      marginalSpend: number;
    }
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
  /**
   * CAPE-based withdrawal (Blanchett / "CAPE rule"):
   *   rate = a + b × (1 / CAPE)
   * Applied to the current portfolio balance each year (variable withdrawal).
   * Conservative defaults: a = 0.0175, b = 0.5.
   * When CAPE is unavailable (pre-1881), falls back to rate = a + b / fallbackCape.
   */
  | { type: 'capeWithdrawal'; a: number; b: number; fallbackCape: number }
  /**
   * Ratchet: spending permanently steps up each time the portfolio's
   * all-time-high crosses a new multiple of `stepSize` above `initial`.
   *
   *   steps = floor(peakGain / stepSize)
   *   wd    = baseRate × initial × (1 + stepBoost × steps)
   *
   * Both thresholds and boosts are anchored to the initial values, so the
   * relationship is linear: each additional step adds the same fixed dollar
   * amount. Unlike floorAndUpside the increase is locked in — a subsequent
   * drop below the threshold does not reduce spending. Peak is tracked via
   * the trajectory so no extra state is needed outside the sim loop.
   */
  | {
      type: 'ratchet';
      baseRate: number;   // e.g. 0.04
      stepSize: number;   // gain fraction per step, e.g. 0.10 (every 10% above initial)
      stepBoost: number;  // additive spending increase per step, e.g. 0.05 (5% of initial spending)
    }
  /**
   * Endowment method: apply `rate` to the rolling `lookbackYears`-average of
   * portfolio balance, then enforce a floor of `floorFraction` × last year's
   * withdrawal to prevent severe lifestyle cuts.
   *
   *   avg  = mean(trajectory[-lookbackYears:].balance)
   *   target = rate × avg
   *   wd   = max(target, floorFraction × prevWithdrawal)
   *
   * Typical parameters: rate = 0.05, lookbackYears = 10, floorFraction = 0.90.
   */
  | {
      type: 'endowment';
      rate: number;
      lookbackYears: number;
      floorFraction: number;
    }
  /**
   * Vanguard Dynamic Spending: apply `rate` to current balance as a baseline,
   * then cap the year-over-year change within [floor, ceiling].
   *
   *   baseline = rate × balance
   *   wd = clamp(baseline, prevWithdrawal × (1 + floor), prevWithdrawal × (1 + ceiling))
   *
   * `ceiling` is a positive fraction (e.g. 0.05 = max +5% per year).
   * `floor` is a negative fraction (e.g. -0.025 = max -2.5% per year).
   * Typical parameters: rate = 0.04–0.05, ceiling = 0.05, floor = -0.025.
   */
  | {
      type: 'vanguardDynamic';
      rate: number;
      ceiling: number;
      floor: number;
    }
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

/**
 * Globals shadowed (passed as `undefined` parameters) when compiling a
 * customSrc strategy, so a strategy body — which can arrive from a shared
 * URL — cannot reach the network or page state. This is best-effort
 * hardening, not a true sandbox: a determined payload can still recover the
 * Function constructor via reflection (e.g. `({}).constructor.constructor`),
 * which is why URL-loaded customSrc also passes through an explicit user
 * confirm gate (see data/urlState.ts). A strategy only needs `state`,
 * `initial`, and pure helpers like `Math`, so shadowing these costs nothing.
 *
 * `eval` is intentionally absent: it is a strict-mode-reserved parameter
 * name. It needs no shadow anyway — a direct `eval(...)` call resolves
 * identifiers in this enclosing scope, where the names below are already
 * shadowed to `undefined`.
 */
const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'Function', 'globalThis', 'self', 'window', 'document', 'parent',
  'top', 'opener', 'frames', 'localStorage', 'sessionStorage', 'indexedDB',
  'navigator', 'location', 'caches', 'crypto', 'Worker', 'SharedWorker',
  'Notification', 'postMessage', 'open',
];

function compileSandboxed(
  params: string[],
  src: string,
): (...args: unknown[]) => unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const compiled = new Function(...BLOCKED_GLOBALS, ...params, src) as (
    ...args: unknown[]
  ) => unknown;
  const blanks = BLOCKED_GLOBALS.map(() => undefined);
  return (...args: unknown[]) => compiled(...blanks, ...args);
}

function compileWithdrawalSrc(
  src: string,
): (state: YearState, initial: number) => number {
  let fn = wdSrcCache.get(src);
  if (!fn) {
    fn = compileSandboxed(['state', 'initial'], src) as (
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
    fn = compileSandboxed(['state'], src) as (state: YearState) => Weights;
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
      // Already in real (today's) $ — see the type definition.
      return strat.amount;
    case 'percentOfBalance': {
      // % of current balance, floored at a fixed real commitment. The floor
      // is what lets a crashed portfolio actually deplete. `?? 0.03` keeps
      // pre-floor scenarios from old shared links sane rather than NaN.
      const floor = Number.isFinite(strat.floor) ? strat.floor : 0.03;
      return Math.max(floor * initial, strat.rate * state.balance);
    }
    case 'floorAndUpside': {
      const excess = Math.max(0, state.balance - initial);
      return strat.floor * initial + strat.marginalSpend * excess;
    }
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
    case 'capeWithdrawal': {
      const cape = state.cape ?? strat.fallbackCape;
      const rate = strat.a + strat.b / cape;
      return rate * state.balance;
    }
    case 'ratchet': {
      const peakBalance = state.trajectory.reduce(
        (max, r) => Math.max(max, r.balance),
        state.balance,
      );
      const gainFraction = Math.max(0, peakBalance / initial - 1);
      const steps = Math.floor(gainFraction / strat.stepSize);
      return strat.baseRate * initial * (1 + strat.stepBoost * steps);
    }
    case 'endowment': {
      const window = state.trajectory.slice(-strat.lookbackYears);
      const avg = window.length
        ? window.reduce((s, r) => s + r.balance, 0) / window.length
        : state.balance;
      const target = strat.rate * avg;
      const prev = state.trajectory[state.trajectory.length - 1];
      return prev ? Math.max(target, strat.floorFraction * prev.withdrawal) : target;
    }
    case 'vanguardDynamic': {
      const baseline = strat.rate * state.balance;
      const prev = state.trajectory[state.trajectory.length - 1];
      if (!prev) return baseline;
      return Math.min(
        prev.withdrawal * (1 + strat.ceiling),
        Math.max(prev.withdrawal * (1 + strat.floor), baseline),
      );
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
