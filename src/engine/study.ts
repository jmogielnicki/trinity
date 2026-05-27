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
 * Static-allocation sweep over two independent axes: stock % and bond %.
 * Every (stock, bond) combination is tried; cash fills whatever is left.
 * Combinations where stock + bond exceeds 100% are dropped.
 */
export type AllocationRangeSpec = {
  fromStock: number;
  toStock: number;
  stepStock: number;
  fromBond: number;
  toBond: number;
  stepBond: number;
};

export type WithdrawalFamily =
  | 'fixedPercent'
  | 'percentOfBalance'
  | 'floorAndUpside'
  | 'ratchet';

/**
 * A withdrawal sweep always varies exactly one numeric parameter of a chosen
 * strategy family; the family's other parameters are pinned. This is the
 * answer to "you can't sweep the whole withdrawal DSL" — you sweep within a
 * family and lock the rest (e.g. sweep ratchet baseRate, pin stepSize/boost).
 */
export type WithdrawalRangeSpec =
  | { family: 'fixedPercent'; from: number; to: number; step: number }
  | {
      family: 'percentOfBalance';
      floor: number;
      from: number;
      to: number;
      step: number;
    }
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
  varying: ['allocation'],
  varyMode: { allocation: 'range', withdrawal: 'range', source: 'range' },
  lockedAllocation: {
    type: 'static',
    weights: { stock: 0.6, bond: 0.4, cash: 0 },
  },
  lockedWithdrawal: { type: 'fixedPercent', rate: 0.04 },
  lockedSource: { type: 'proportional', rebalance: true },
  allocationRange: {
    fromStock: 0.4,
    toStock: 1.0,
    stepStock: 0.1,
    fromBond: 0.0,
    toBond: 0.4,
    stepBond: 0.1,
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
 * Cartesian product of the stock and bond axes. cash = 1 − stock − bond;
 * combinations that would need negative cash are dropped.
 */
export function allocationRangeVariants(
  spec: AllocationRangeSpec,
): AllocationStrategy[] {
  const stocks = rangeValues(spec.fromStock, spec.toStock, spec.stepStock);
  const bonds = rangeValues(spec.fromBond, spec.toBond, spec.stepBond);
  const out: AllocationStrategy[] = [];
  for (const rawStock of stocks) {
    for (const rawBond of bonds) {
      const stock = Math.max(0, Math.min(1, rawStock));
      const bond = Math.max(0, Math.min(1, rawBond));
      const cash = round6(1 - stock - bond);
      if (cash < -1e-6) continue; // stock + bond > 100%
      out.push({
        type: 'static',
        weights: { stock, bond, cash: Math.max(0, cash) },
      });
      if (out.length >= MAX_ALLOC_COMBOS) return out;
    }
  }
  return out;
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
    case 'percentOfBalance':
      return vals.map((rate) => ({
        wd: { type: 'percentOfBalance', rate, floor: spec.floor },
        numeric: { withdrawalRate: rate, floor: spec.floor },
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
