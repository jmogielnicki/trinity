import type { AllocationStrategy, WithdrawalStrategy } from './strategies';
import type { Candidate, CandidateNumericParams } from './optimize';
import type { Weights } from './types';
import {
  DEFAULT_WATERFALL_ORDER,
  type RefillRule,
  type WithdrawalSource,
} from './withdrawalSource';

/**
 * A "study" is a lock-2-vary-1 search: two of the three strategy dimensions
 * (allocation, withdrawal, withdrawal source) are pinned to a single concrete
 * value, and the third sweeps over a set of variants. The variants are either
 * generated from a numeric range (`range` mode) or hand-assembled (`list`
 * mode). Every variant is run against all historical start years, and the
 * results are compared side by side.
 */
export type StudyDimension = 'allocation' | 'withdrawal' | 'source';
export type VaryMode = 'range' | 'list';

/** Static stock-allocation sweep. cash is held at 0; bonds take the rest. */
export type AllocationRangeSpec = {
  fromStock: number;
  toStock: number;
  step: number;
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
      sweep: 'floor' | 'marginalSpend';
      floor: number;
      marginalSpend: number;
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
  varying: StudyDimension;
  varyMode: VaryMode;
  /** Locked (pinned) value for each non-varying dimension. */
  lockedAllocation: AllocationStrategy;
  lockedWithdrawal: WithdrawalStrategy;
  lockedSource: WithdrawalSource;
  /** Range-mode specs — only the one matching `varying` is consulted. */
  allocationRange: AllocationRangeSpec;
  withdrawalRange: WithdrawalRangeSpec;
  /** Selected source-preset ids for source range mode. */
  sourcePresetIds: string[];
  /** List-mode entries — only the one matching `varying` is consulted. */
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
  varying: 'allocation',
  varyMode: 'range',
  lockedAllocation: {
    type: 'static',
    weights: { stock: 0.6, bond: 0.4, cash: 0 },
  },
  lockedWithdrawal: { type: 'fixedPercent', rate: 0.04 },
  lockedSource: { type: 'proportional', rebalance: true },
  allocationRange: { fromStock: 0.4, toStock: 1.0, step: 0.1 },
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
      return `${pct(w.floor)} floor +$${Math.round(w.marginalSpend * 1000)}k/$1M`;
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

type ResolvedVariant = {
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  source: WithdrawalSource;
  /** Numeric value of the swept parameter — drives axis/color coding. */
  varyValue: number;
  numeric: CandidateNumericParams;
};

function allocationVariants(study: StudyConfig): AllocationStrategy[] {
  if (study.varyMode === 'list') return study.allocationList;
  const { fromStock, toStock, step } = study.allocationRange;
  return rangeValues(fromStock, toStock, step).map((stock) => {
    const s = Math.max(0, Math.min(1, stock));
    return {
      type: 'static',
      weights: { stock: s, bond: 1 - s, cash: 0 },
    } as AllocationStrategy;
  });
}

function withdrawalVariants(
  study: StudyConfig,
): Array<{ wd: WithdrawalStrategy; numeric: CandidateNumericParams }> {
  if (study.varyMode === 'list') {
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
        const marginalSpend =
          spec.sweep === 'marginalSpend' ? v : spec.marginalSpend;
        return {
          wd: { type: 'floorAndUpside', floor, marginalSpend },
          numeric: { floor, marginalSpend },
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
  if (study.varyMode === 'list') return study.sourceList;
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

function resolveVariants(study: StudyConfig): ResolvedVariant[] {
  const { lockedAllocation, lockedWithdrawal, lockedSource } = study;
  if (study.varying === 'allocation') {
    return allocationVariants(study).map((allocation) => {
      const stockPct = stockPctOf(allocation);
      return {
        allocation,
        withdrawal: lockedWithdrawal,
        source: lockedSource,
        varyValue: stockPct ?? 0,
        numeric: { stockPct, varyValue: stockPct },
      };
    });
  }
  if (study.varying === 'withdrawal') {
    return withdrawalVariants(study).map(({ wd, numeric }) => {
      const varyValue =
        numeric.withdrawalRate ?? numeric.floor ?? numeric.marginalSpend ?? 0;
      return {
        allocation: lockedAllocation,
        withdrawal: wd,
        source: lockedSource,
        varyValue,
        numeric: { ...numeric, varyValue },
      };
    });
  }
  return sourceVariants(study).map((source, i) => ({
    allocation: lockedAllocation,
    withdrawal: lockedWithdrawal,
    source,
    varyValue: i,
    numeric: { varyValue: i },
  }));
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/** Short label for the dimension being swept — used as axis/color title. */
export function varyLabel(study: StudyConfig): string {
  switch (study.varying) {
    case 'allocation':
      return 'Allocation';
    case 'withdrawal':
      return 'Withdrawal';
    case 'source':
      return 'Withdrawal source';
  }
}

/**
 * Turn a study config into the flat candidate list the optimizer runs. Every
 * candidate shares the two locked dimensions; only the varying one differs.
 */
export function generateStudyCandidates(study: StudyConfig): Candidate[] {
  const variants = resolveVariants(study);
  return variants.map((v, i) => {
    const allocDesc = describeAllocation(v.allocation);
    const wdDesc = describeWithdrawal(v.withdrawal);
    const srcDesc = describeSource(v.source);
    const label =
      study.varying === 'allocation'
        ? allocDesc
        : study.varying === 'withdrawal'
          ? wdDesc
          : srcDesc;
    return {
      id: `${study.varying}-${i}-${label}`,
      label,
      allocation: v.allocation,
      withdrawal: v.withdrawal,
      withdrawalSource: v.source,
      params: { withdrawal: wdDesc, allocation: allocDesc, source: srcDesc },
      numericParams: v.numeric,
    };
  });
}
