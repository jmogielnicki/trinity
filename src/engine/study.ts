import type { AllocationStrategy, WithdrawalStrategy } from './strategies';
import type { Candidate, CandidateNumericParams } from './optimize';
import type { Weights } from './types';
import {
  DEFAULT_WATERFALL_ORDER,
  type RefillRule,
  type WithdrawalSource,
} from './withdrawalSource';

/**
 * A "study" pins some of the three strategy dimensions (allocation,
 * withdrawal, withdrawal source) and sweeps the others. One swept dimension
 * produces a 1D study (scatter / trajectory comparison); two swept dimensions
 * produce a 2D study (heatmap grid). Each swept dimension's variants are
 * either generated from a numeric range (`range` mode) or hand-assembled
 * (`list` mode). Every variant combination runs against all historical start
 * years.
 */
export type StudyDimension = 'allocation' | 'withdrawal' | 'source';
export type VaryMode = 'range' | 'list';

/**
 * Allocation sweep. The `static` sub-mode sweeps three independent axes
 * (stock / bond / cash) and only emits combinations that sum to 100% within
 * float epsilon — there is no "residual" axis. The `glide` sub-mode varies a
 * single glidepath parameter (start stock %, end stock %, or transition
 * years) while pinning the rest; bonds fill the non-stock weight at each end
 * and cash is held at zero (the canonical lifecycle shape).
 */
export type AllocationRangeSpec =
  | {
      subMode: 'static';
      fromStock: number;
      toStock: number;
      stepStock: number;
      fromBond: number;
      toBond: number;
      stepBond: number;
      fromCash: number;
      toCash: number;
      stepCash: number;
    }
  | {
      subMode: 'glide';
      sweep: 'startStock' | 'endStock' | 'transitionYears';
      startStock: number;
      endStock: number;
      transitionYears: number;
      /**
       * Range for the swept parameter. Units depend on `sweep`: fractional
       * weights for startStock/endStock, integer years for transitionYears.
       */
      from: number;
      to: number;
      step: number;
    };

export type WithdrawalFamily =
  | 'fixedPercent'
  | 'floorAndUpside'
  | 'ratchet'
  | 'curve'
  | 'cape';

/**
 * A withdrawal sweep always varies exactly one numeric parameter of a chosen
 * strategy family; the family's other parameters are pinned. This is the
 * answer to "you can't sweep the whole withdrawal DSL" — you sweep within a
 * family and lock the rest (e.g. sweep ratchet baseRate, pin stepSize/boost).
 */
export type WithdrawalRangeSpec =
  | { family: 'fixedPercent'; from: number; to: number; step: number }
  | {
      family: 'floorAndUpside';
      sweep: 'floor' | 'upsideRate';
      floor: number;
      upsideRate: number;
      from: number;
      to: number;
      step: number;
    }
  | {
      family: 'ratchet';
      sweep: 'baseRate' | 'stepBoost';
      baseRate: number;
      stepSize: number;
      stepBoost: number;
      from: number;
      to: number;
      step: number;
    }
  /**
   * Withdrawal curve as a 2-point piecewiseLinear ramp (start rate → end rate
   * over `transitionYears`). The sweep parameter perturbs the whole curve:
   *   - `shift`  — adds `delta` to both rates (parallel shift up/down).
   *   - `scale`  — multiplies both rates by `k` (steeper or flatter ramp).
   * The engine extrapolates flat past the transition point, so horizons longer
   * than `transitionYears` just hold at the end rate.
   */
  | {
      family: 'curve';
      sweep: 'shift' | 'scale';
      startRate: number;
      endRate: number;
      transitionYears: number;
      from: number;
      to: number;
      step: number;
    }
  /**
   * CAPE-based withdrawal: rate = a + b / CAPE. Sweep one of:
   *   - `a` — constant baseline (the "always-on" floor).
   *   - `b` — sensitivity to (1 / CAPE) (higher = more aggressive in cheap markets).
   */
  | {
      family: 'cape';
      sweep: 'a' | 'b';
      a: number;
      b: number;
      fallbackCape: number;
      from: number;
      to: number;
      step: number;
    };

export type StudyConfig = {
  /**
   * Dimensions being swept: 1 entry for a 1D study, 2 for a 2D heatmap study.
   * `varying[0]` is the primary axis (heatmap rows), `varying[1]` the
   * secondary (columns).
   */
  varying: StudyDimension[];
  /** range vs list mode, chosen per dimension. */
  varyMode: Record<StudyDimension, VaryMode>;
  /** Locked (pinned) value for each non-swept dimension. */
  lockedAllocation: AllocationStrategy;
  lockedWithdrawal: WithdrawalStrategy;
  lockedSource: WithdrawalSource;
  /** Range-mode specs — only those for swept dimensions are consulted. */
  allocationRange: AllocationRangeSpec;
  withdrawalRange: WithdrawalRangeSpec;
  /** Selected source-preset ids for source range mode. */
  sourcePresetIds: string[];
  /** List-mode entries — only those for swept dimensions are consulted. */
  allocationList: AllocationStrategy[];
  withdrawalList: WithdrawalStrategy[];
  sourceList: WithdrawalSource[];
};

const DEFAULT_REFILL_CHAIN: RefillRule[] = [
  {
    targetSleeve: 'bond',
    floor: 6,
    ceiling: 6,
    floorMode: 'withdrawalYears',
    sourceSleeve: 'stock',
    sourceReturnGate: 0,
  },
  {
    targetSleeve: 'cash',
    floor: 2,
    ceiling: 2,
    floorMode: 'withdrawalYears',
    sourceSleeve: 'bond',
  },
];

export type SourcePreset = {
  id: string;
  label: string;
  source: WithdrawalSource;
};

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'prop-rebal',
    label: 'proportional + rebalance',
    source: { type: 'proportional', rebalance: true },
  },
  {
    id: 'prop-drift',
    label: 'proportional, no rebalance',
    source: { type: 'proportional', rebalance: false },
  },
  {
    id: 'waterfall',
    label: 'waterfall (cash→bond→stock)',
    source: { type: 'waterfall', order: DEFAULT_WATERFALL_ORDER },
  },
  {
    id: 'bucket',
    label: 'bucket (refill chain)',
    source: {
      type: 'bucket',
      order: DEFAULT_WATERFALL_ORDER,
      refill: DEFAULT_REFILL_CHAIN,
    },
  },
];

export const DEFAULT_STUDY: StudyConfig = {
  varying: [],
  varyMode: { allocation: 'range', withdrawal: 'range', source: 'range' },
  lockedAllocation: {
    type: 'static',
    weights: { stock: 0.6, bond: 0.4, cash: 0 },
  },
  lockedWithdrawal: { type: 'fixedPercent', rate: 0.04 },
  lockedSource: { type: 'proportional', rebalance: true },
  allocationRange: {
    subMode: 'static',
    fromStock: 0.4,
    toStock: 1.0,
    stepStock: 0.1,
    fromBond: 0.0,
    toBond: 0.6,
    stepBond: 0.1,
    fromCash: 0.0,
    toCash: 0.2,
    stepCash: 0.05,
  },
  withdrawalRange: { family: 'fixedPercent', from: 0.03, to: 0.06, step: 0.0025 },
  sourcePresetIds: ['prop-rebal', 'waterfall', 'bucket'],
  allocationList: [
    { type: 'static', weights: { stock: 0.5, bond: 0.5, cash: 0 } },
    { type: 'static', weights: { stock: 0.7, bond: 0.3, cash: 0 } },
  ],
  withdrawalList: [
    { type: 'fixedPercent', rate: 0.035 },
    { type: 'fixedPercent', rate: 0.045 },
  ],
  sourceList: [
    { type: 'proportional', rebalance: true },
    { type: 'waterfall', order: DEFAULT_WATERFALL_ORDER },
  ],
};

// ---------------------------------------------------------------------------
// Withdrawal archetypes — a palette for assembling a mixed-family list sweep
// ---------------------------------------------------------------------------

export type WithdrawalArchetype = {
  id: string;
  label: string;
  make: () => WithdrawalStrategy;
  /**
   * Whether WithdrawalEditor renders a dedicated editor for this type. The
   * others still run and compare correctly — they're just added with their
   * canonical parameters rather than tuned inline.
   */
  editable: boolean;
};

/**
 * One-click building blocks for a hand-picked withdrawal sweep. This is how
 * you race different *families* (fixed vs ratchet vs CAPE …) against each
 * other — categorical, so it lives in list mode, not the numeric range sweep.
 */
export const WITHDRAWAL_ARCHETYPES: WithdrawalArchetype[] = [
  { id: 'fixed', label: 'Fixed %', editable: true, make: () => ({ type: 'fixedPercent', rate: 0.04 }) },
  { id: 'pctBalance', label: '% of balance', editable: false, make: () => ({ type: 'percentOfBalance', rate: 0.04, floor: 0.0325 }) },
  { id: 'floorUpside', label: 'Floor + upside', editable: true, make: () => ({ type: 'floorAndUpside', floor: 0.0325, upsideRate: 0.03 }) },
  { id: 'ratchet', label: 'Ratchet', editable: true, make: () => ({ type: 'ratchet', baseRate: 0.0325, stepSize: 0.1, stepBoost: 0.05 }) },
  { id: 'guardrails', label: 'Guardrails', editable: false, make: () => ({ type: 'guardrails', base: 0.05, trigger: 0.2, ceiling: 1.25, floor: 0.8 }) },
  { id: 'cape', label: 'CAPE', editable: true, make: () => ({ type: 'capeWithdrawal', a: 0.0175, b: 0.5, fallbackCape: 20 }) },
  { id: 'endowment', label: 'Endowment', editable: false, make: () => ({ type: 'endowment', rate: 0.05, lookbackYears: 10, floorFraction: 0.9 }) },
  { id: 'vanguard', label: 'Vanguard dynamic', editable: false, make: () => ({ type: 'vanguardDynamic', rate: 0.05, ceiling: 0.05, floor: -0.025 }) },
];

/** Withdrawal types WithdrawalEditor cannot edit inline (added with defaults). */
export const WITHDRAWAL_EDITOR_UNSUPPORTED = new Set<WithdrawalStrategy['type']>([
  'percentOfBalance',
  'guardrails',
  'endowment',
  'vanguardDynamic',
]);

// ---------------------------------------------------------------------------
// Numeric range helper
// ---------------------------------------------------------------------------

const MAX_RANGE_POINTS = 60;

/** Inclusive range, integer step count to avoid float drift, capped length. */
export function rangeValues(from: number, to: number, step: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [from];
  if (step <= 0 || to < from) return [from];
  const n = Math.min(MAX_RANGE_POINTS - 1, Math.round((to - from) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(round6(from + i * step));
  }
  return out;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Human-readable descriptors
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function dominant(w: Weights): Weights {
  const s = w.stock + w.bond + w.cash || 1;
  return { stock: w.stock / s, bond: w.bond / s, cash: w.cash / s };
}

export function describeAllocation(a: AllocationStrategy): string {
  switch (a.type) {
    case 'static': {
      const w = dominant(a.weights);
      return `${Math.round(w.stock * 100)}/${Math.round(w.bond * 100)}/${Math.round(w.cash * 100)}`;
    }
    case 'glidepath':
      return `glide ${Math.round(dominant(a.start).stock * 100)}→${Math.round(dominant(a.end).stock * 100)}% stk / ${a.transitionYears}y`;
    case 'risingEquity':
      return `rising ${Math.round(dominant(a.start).stock * 100)}→${Math.round(dominant(a.end).stock * 100)}% stk`;
    case 'linearDrift':
      return `drift from ${Math.round(dominant(a.start).stock * 100)}% stk`;
    case 'ageInBonds':
      return `age-in-bonds (age ${a.currentAge})`;
    case 'ruleBased':
      return `rule-based (${a.rules.length} rules)`;
    case 'custom':
    case 'customSrc':
      return 'custom script';
  }
}

export function describeWithdrawal(w: WithdrawalStrategy): string {
  switch (w.type) {
    case 'fixedPercent':
      return `${pct(w.rate)} fixed`;
    case 'fixedDollar':
      return `$${Math.round(w.amount / 1000)}k/yr`;
    case 'percentOfBalance':
      return `${pct(w.rate)} of bal, ${pct(w.floor)} floor`;
    case 'floorAndUpside':
      return `${pct(w.floor)} floor / ${pct(w.upsideRate)} of bal`;
    case 'piecewise':
    case 'piecewiseLinear':
      return 'withdrawal curve';
    case 'guardrails':
      return `guardrails ${pct(w.base)}`;
    case 'ruleBased':
      return `rule-based ${pct(w.base)}`;
    case 'capeWithdrawal':
      return `CAPE (a=${w.a}, b=${w.b})`;
    case 'ratchet':
      return `ratchet ${pct(w.baseRate)} +${pct(w.stepBoost)}/${pct(w.stepSize)}`;
    case 'endowment':
      return `endowment ${pct(w.rate)} (${w.lookbackYears}y avg)`;
    case 'vanguardDynamic':
      return `Vanguard dynamic ${pct(w.rate)}`;
    case 'custom':
    case 'customSrc':
      return 'custom script';
  }
}

export function describeSource(s: WithdrawalSource): string {
  switch (s.type) {
    case 'proportional':
      return s.rebalance ? 'proportional + rebalance' : 'proportional, no rebalance';
    case 'waterfall':
      return `waterfall (${s.order.join('→')})`;
    case 'bucket':
      return `bucket (${s.refill.length} refill rule${s.refill.length === 1 ? '' : 's'})`;
  }
}

// ---------------------------------------------------------------------------
// Variant resolution
// ---------------------------------------------------------------------------

/** Cap on the number of (stock, bond) combinations a 2D sweep produces. */
const MAX_ALLOC_COMBOS = 150;

/**
 * Cartesian product across the active sub-mode's axes. For `static`, that's
 * stock × bond × cash with a strict sum-to-100% filter (no residual axis).
 * For `glide`, that's a single swept glidepath parameter while the rest stay
 * pinned; bonds fill the non-stock weight, cash held at zero.
 */
export function allocationRangeVariants(
  spec: AllocationRangeSpec,
): AllocationStrategy[] {
  if (spec.subMode === 'glide') return glideRangeVariants(spec);
  return staticRangeVariants(spec);
}

function staticRangeVariants(
  spec: Extract<AllocationRangeSpec, { subMode: 'static' }>,
): AllocationStrategy[] {
  const stocks = rangeValues(spec.fromStock, spec.toStock, spec.stepStock);
  const bonds = rangeValues(spec.fromBond, spec.toBond, spec.stepBond);
  const cashes = rangeValues(spec.fromCash, spec.toCash, spec.stepCash);
  const out: AllocationStrategy[] = [];
  for (const rawStock of stocks) {
    for (const rawBond of bonds) {
      for (const rawCash of cashes) {
        const stock = round6(Math.max(0, Math.min(1, rawStock)));
        const bond = round6(Math.max(0, Math.min(1, rawBond)));
        const cash = round6(Math.max(0, Math.min(1, rawCash)));
        // Strict sum=1 filter. Loose tolerance covers float drift from the
        // ranged steps (e.g. 0.05 + 0.05 + 0.9 may round to 0.99999...).
        if (Math.abs(stock + bond + cash - 1) > 1e-4) continue;
        out.push({ type: 'static', weights: { stock, bond, cash } });
        if (out.length >= MAX_ALLOC_COMBOS) return out;
      }
    }
  }
  return out;
}

function glideRangeVariants(
  spec: Extract<AllocationRangeSpec, { subMode: 'glide' }>,
): AllocationStrategy[] {
  const vals = rangeValues(spec.from, spec.to, spec.step);
  const out: AllocationStrategy[] = [];
  for (const v of vals) {
    const startStock =
      spec.sweep === 'startStock' ? clamp01(v) : clamp01(spec.startStock);
    const endStock =
      spec.sweep === 'endStock' ? clamp01(v) : clamp01(spec.endStock);
    const transitionYears =
      spec.sweep === 'transitionYears'
        ? Math.max(1, Math.round(v))
        : Math.max(1, Math.round(spec.transitionYears));
    out.push({
      type: 'glidepath',
      start: { stock: startStock, bond: round6(1 - startStock), cash: 0 },
      end: { stock: endStock, bond: round6(1 - endStock), cash: 0 },
      transitionYears,
    });
    if (out.length >= MAX_ALLOC_COMBOS) return out;
  }
  return out;
}

function clamp01(n: number): number {
  return round6(Math.max(0, Math.min(1, n)));
}

function allocationVariants(study: StudyConfig): AllocationStrategy[] {
  if (study.varyMode.allocation === 'list') return study.allocationList;
  return allocationRangeVariants(study.allocationRange);
}

function withdrawalVariants(
  study: StudyConfig,
): Array<{ wd: WithdrawalStrategy; numeric: CandidateNumericParams }> {
  if (study.varyMode.withdrawal === 'list') {
    return study.withdrawalList.map((wd) => ({ wd, numeric: {} }));
  }
  const spec = study.withdrawalRange;
  const vals = rangeValues(spec.from, spec.to, spec.step);
  switch (spec.family) {
    case 'fixedPercent':
      return vals.map((rate) => ({
        wd: { type: 'fixedPercent', rate },
        numeric: { withdrawalRate: rate },
      }));
    case 'floorAndUpside':
      return vals.map((v) => {
        const floor = spec.sweep === 'floor' ? v : spec.floor;
        const upsideRate = spec.sweep === 'upsideRate' ? v : spec.upsideRate;
        return {
          wd: { type: 'floorAndUpside', floor, upsideRate },
          numeric: { floor, upsideRate },
        };
      });
    case 'ratchet':
      return vals.map((v) => {
        const baseRate = spec.sweep === 'baseRate' ? v : spec.baseRate;
        const stepBoost = spec.sweep === 'stepBoost' ? v : spec.stepBoost;
        return {
          wd: {
            type: 'ratchet',
            baseRate,
            stepSize: spec.stepSize,
            stepBoost,
          },
          numeric: { withdrawalRate: baseRate },
        };
      });
    case 'curve':
      return vals.map((v) => {
        const startRate =
          spec.sweep === 'shift' ? spec.startRate + v : spec.startRate * v;
        const endRate =
          spec.sweep === 'shift' ? spec.endRate + v : spec.endRate * v;
        return {
          wd: {
            type: 'piecewiseLinear',
            points: [
              { t: 0, rate: startRate },
              { t: spec.transitionYears, rate: endRate },
            ],
          },
          numeric: { withdrawalRate: (startRate + endRate) / 2 },
        };
      });
    case 'cape':
      return vals.map((v) => {
        const a = spec.sweep === 'a' ? v : spec.a;
        const b = spec.sweep === 'b' ? v : spec.b;
        return {
          wd: { type: 'capeWithdrawal', a, b, fallbackCape: spec.fallbackCape },
          numeric: { withdrawalRate: a + b / spec.fallbackCape },
        };
      });
  }
}

function sourceVariants(study: StudyConfig): WithdrawalSource[] {
  if (study.varyMode.source === 'list') return study.sourceList;
  return SOURCE_PRESETS.filter((p) => study.sourcePresetIds.includes(p.id)).map(
    (p) => p.source,
  );
}

/** Representative stock fraction for a static / glide allocation. */
function stockPctOf(a: AllocationStrategy): number | undefined {
  if (a.type === 'static') return dominant(a.weights).stock;
  if (a.type === 'glidepath' || a.type === 'risingEquity')
    return (dominant(a.start).stock + dominant(a.end).stock) / 2;
  if (a.type === 'linearDrift') return dominant(a.start).stock;
  return undefined;
}

/** One variant of a single dimension — a partial scenario plus display info. */
type DimVariant = {
  allocation?: AllocationStrategy;
  withdrawal?: WithdrawalStrategy;
  source?: WithdrawalSource;
  label: string;
  /** Numeric value of the variant — drives heatmap axis ordering / color. */
  varyValue: number;
  numeric: CandidateNumericParams;
};

function dimensionVariants(
  study: StudyConfig,
  dim: StudyDimension,
): DimVariant[] {
  if (dim === 'allocation') {
    return allocationVariants(study).map((allocation) => {
      const stockPct = stockPctOf(allocation);
      return {
        allocation,
        label: describeAllocation(allocation),
        varyValue: stockPct ?? 0,
        numeric: { stockPct },
      };
    });
  }
  if (dim === 'withdrawal') {
    return withdrawalVariants(study).map(({ wd, numeric }) => ({
      withdrawal: wd,
      label: describeWithdrawal(wd),
      varyValue:
        numeric.withdrawalRate ?? numeric.floor ?? numeric.upsideRate ?? 0,
      numeric,
    }));
  }
  return sourceVariants(study).map((source, i) => ({
    source,
    label: describeSource(source),
    varyValue: i,
    numeric: {},
  }));
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

export type StudyAxis = {
  dimension: StudyDimension;
  label: string;
  /** Variant labels along this axis, in order. */
  ticks: string[];
};

export type StudyResult = {
  /**
   * For a 2D study, candidates are row-major: index = row * cols + col,
   * where row indexes `axes[0]` and col indexes `axes[1]`.
   */
  candidates: Candidate[];
  axes: StudyAxis[];
};

/** Display name for a study dimension; matches the sidebar section headers. */
export function dimLabel(dim: StudyDimension): string {
  switch (dim) {
    case 'allocation':
      return 'Holdings mix';
    case 'withdrawal':
      return 'Withdrawal strategy';
    case 'source':
      return 'Withdrawal source';
  }
}

/** De-dupe, drop invalid entries, and cap at 2 swept dimensions. */
export function normalizeVarying(varying: StudyDimension[]): StudyDimension[] {
  const seen = new Set<StudyDimension>();
  const out: StudyDimension[] = [];
  for (const d of varying) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out.length ? out.slice(0, 2) : ['allocation'];
}

/** Primary swept-dimension label — used for 1D scatter color coding. */
export function varyLabel(study: StudyConfig): string {
  return dimLabel(normalizeVarying(study.varying)[0]);
}

/**
 * Expand a study config into the candidate grid the optimizer runs. A 1D
 * study yields a flat list; a 2D study yields a row-major grid (the cartesian
 * product of the two swept dimensions' variants).
 */
export function generateStudy(study: StudyConfig): StudyResult {
  const dims = normalizeVarying(study.varying);
  const variantsByDim = dims.map((d) => dimensionVariants(study, d));

  const makeCandidate = (picks: DimVariant[], idx: number): Candidate => {
    const allocation =
      picks.find((p) => p.allocation)?.allocation ?? study.lockedAllocation;
    const withdrawal =
      picks.find((p) => p.withdrawal)?.withdrawal ?? study.lockedWithdrawal;
    const source = picks.find((p) => p.source)?.source ?? study.lockedSource;
    const numeric: CandidateNumericParams = {};
    for (const p of picks) Object.assign(numeric, p.numeric);
    numeric.varyValue = picks[0]?.varyValue;
    if (picks[1]) numeric.varyValue2 = picks[1].varyValue;
    const label = picks.map((p) => p.label).join('  ×  ');
    return {
      id: `c${idx}·${label}`,
      label,
      allocation,
      withdrawal,
      withdrawalSource: source,
      params: {
        allocation: describeAllocation(allocation),
        withdrawal: describeWithdrawal(withdrawal),
        source: describeSource(source),
      },
      numericParams: numeric,
    };
  };

  const candidates: Candidate[] = [];
  if (dims.length === 1) {
    variantsByDim[0].forEach((v, i) => candidates.push(makeCandidate([v], i)));
  } else {
    const [rows, cols] = variantsByDim;
    let i = 0;
    for (const r of rows) {
      for (const c of cols) candidates.push(makeCandidate([r, c], i++));
    }
  }

  const axes: StudyAxis[] = dims.map((d, k) => ({
    dimension: d,
    label: dimLabel(d),
    ticks: variantsByDim[k].map((v) => v.label),
  }));

  return { candidates, axes };
}

/** Flat candidate list — convenience for callers that don't need the grid. */
export function generateStudyCandidates(study: StudyConfig): Candidate[] {
  return generateStudy(study).candidates;
}

// ---------------------------------------------------------------------------
// Auto mode — sweep all three dimensions at once over a fixed preset grid
// ---------------------------------------------------------------------------

export type AutoStudyParams = {
  /** Lower bound for withdrawal sweeps, e.g. 0.03. */
  minWithdrawalRate: number;
  /** Retirement horizon, used as the transition length for glides and curves. */
  horizonYears: number;
};

/**
 * The 10%-increment weight grid used by auto mode: every (stock, bond, cash)
 * triple that sums to 100% with stock ≥ 50%. Cash is whatever's left after
 * stock and bond. Yields 21 mixes (6 + 5 + 4 + 3 + 2 + 1).
 */
function autoWeightGrid(): Weights[] {
  const out: Weights[] = [];
  for (let s = 5; s <= 10; s++) {
    for (let b = 0; b <= 10 - s; b++) {
      const stock = round6(s / 10);
      const bond = round6(b / 10);
      const cash = round6(1 - stock - bond);
      out.push({ stock, bond, cash });
    }
  }
  return out;
}

/**
 * Allocation variants for auto mode: every fixed mix from the weight grid
 * (21) plus every ordered glide between two distinct grid mixes (21×21 − 21 =
 * 420), for 441 total. Glides span the full horizon and include both rising
 * and declining equity.
 */
export function autoAllocationVariants(horizonYears: number): AllocationStrategy[] {
  const grid = autoWeightGrid();
  const out: AllocationStrategy[] = [];
  for (const w of grid) out.push({ type: 'static', weights: w });
  const transitionYears = Math.max(1, Math.round(horizonYears));
  for (const start of grid) {
    for (const end of grid) {
      if (start === end) continue; // same mix = a static alloc, already added
      out.push({ type: 'glidepath', start, end, transitionYears });
    }
  }
  return out;
}

/**
 * Withdrawal variants for auto mode (W = minWithdrawalRate):
 *   - fixed %: W → 5% in 0.25% steps
 *   - ratchet: baseRate = W, stepSize = 10%, stepBoost 3% → 10% in 1% steps
 *   - curve:   flat-W start, end ramped W+0.25% → 6% in 0.25% steps over the
 *              full horizon (the end == W case is dropped — it's just fixed W)
 */
export function autoWithdrawalVariants(
  p: AutoStudyParams,
): Array<{ wd: WithdrawalStrategy; numeric: CandidateNumericParams }> {
  const W = p.minWithdrawalRate;
  const transitionYears = Math.max(1, Math.round(p.horizonYears));
  const out: Array<{ wd: WithdrawalStrategy; numeric: CandidateNumericParams }> = [];

  for (const rate of rangeValues(W, 0.05, 0.0025)) {
    out.push({ wd: { type: 'fixedPercent', rate }, numeric: { withdrawalRate: rate } });
  }
  for (const stepBoost of rangeValues(0.03, 0.1, 0.01)) {
    out.push({
      wd: { type: 'ratchet', baseRate: W, stepSize: 0.1, stepBoost },
      numeric: { withdrawalRate: W },
    });
  }
  for (const endRate of rangeValues(round6(W + 0.0025), 0.06, 0.0025)) {
    out.push({
      wd: {
        type: 'piecewiseLinear',
        points: [
          { t: 0, rate: W },
          { t: transitionYears, rate: endRate },
        ],
      },
      numeric: { withdrawalRate: (W + endRate) / 2 },
    });
  }
  return out;
}

/** Per-dimension and total candidate counts — cheap, for the panel's preview. */
export function autoCandidateCounts(p: AutoStudyParams): {
  allocations: number;
  withdrawals: number;
  sources: number;
  total: number;
} {
  const allocations = autoAllocationVariants(p.horizonYears).length;
  const withdrawals = autoWithdrawalVariants(p).length;
  const sources = SOURCE_PRESETS.length;
  return { allocations, withdrawals, sources, total: allocations * withdrawals * sources };
}

/**
 * Build the full auto-mode candidate set — the cartesian product of
 * allocation × withdrawal × source. Emits the same `Candidate` shape as
 * `generateStudy` so the entire metrics / frontier / scatter pipeline is
 * reused unchanged. There is no swept axis, so callers pair this with
 * `axes: []`.
 */
export function generateAutoCandidates(p: AutoStudyParams): Candidate[] {
  const allocations = autoAllocationVariants(p.horizonYears);
  const withdrawals = autoWithdrawalVariants(p);
  const sources = SOURCE_PRESETS.map((preset) => preset.source);

  const candidates: Candidate[] = [];
  let idx = 0;
  for (const allocation of allocations) {
    const stockPct = stockPctOf(allocation);
    const allocLabel = describeAllocation(allocation);
    for (const { wd, numeric } of withdrawals) {
      const wdLabel = describeWithdrawal(wd);
      for (const source of sources) {
        const srcLabel = describeSource(source);
        const label = `${allocLabel}  ×  ${wdLabel}  ×  ${srcLabel}`;
        candidates.push({
          id: `a${idx}·${label}`,
          label,
          allocation,
          withdrawal: wd,
          withdrawalSource: source,
          params: {
            allocation: allocLabel,
            withdrawal: wdLabel,
            source: srcLabel,
          },
          numericParams: { ...numeric, stockPct, varyValue: stockPct ?? 0 },
        });
        idx++;
      }
    }
  }
  return candidates;
}
