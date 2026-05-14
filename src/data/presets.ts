import type { SerializedState } from './urlState';

/**
 * Curated starting points. Each preset is a fully-specified SerializedState
 * that can hydrate the stores via the same path as URL hash / library load.
 * Sweep axes default to pinned; users can flip them on after loading.
 */

export type Preset = {
  id: string;
  name: string;
  description: string;
  state: SerializedState;
};

const PINNED_AXES: SerializedState['axes'] = {
  withdrawalRate: { mode: 'pin' },
  stockPct: { mode: 'pin' },
  horizon: { mode: 'pin' },
};

const STARTING = 1_000_000;
const HORIZON = 30;

function flatStatic(stock: number, bond: number, cash: number) {
  return { type: 'static' as const, weights: { stock, bond, cash } };
}

export const PRESETS: Preset[] = [
  {
    id: 'classic-60-40',
    name: 'Classic 60/40 — 4%',
    description: 'The default starting point. 60/40 stocks/bonds, 4% real, rebalanced annually.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.6, 0.4, 0),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'bengen-50-50',
    name: 'Bengen 50/50 — 4%',
    description: "The original 4% rule (Bengen 1994). 50/50 stocks/bonds, 30-year horizon.",
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.5, 0.5, 0),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'trinity-75-25',
    name: 'Trinity 75/25 — 4%',
    description: 'Trinity Study (Cooley, Hubbard, Walz 1998). 75/25, 4%, ~95% historical success.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.75, 0.25, 0),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'aggressive-100',
    name: 'Aggressive 100/0 — 4%',
    description: 'All stocks, no bonds. Fewer failures historically but bigger drawdowns.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(1, 0, 0),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'cash-bucket',
    name: 'Cash bucket — 50/40/10 waterfall',
    description: '50% stocks / 40% bonds / 10% cash. Withdraw cash first, then bonds, then stocks. Sleeves drift; no auto-rebalance.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.5, 0.4, 0.1),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'waterfall', order: ['cash', 'bond', 'stock'] },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'cash-bucket-refill',
    name: 'Cash bucket with refill — 50/35/15',
    description: '50/35/15 stocks/bonds/cash. Spend cash first; when cash drops below 8% and stocks are at or above their initial value, sell stocks back into cash up to 15%.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.5, 0.35, 0.15),
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: {
        type: 'bucket',
        order: ['cash', 'bond', 'stock'],
        refill: {
          targetSleeve: 'cash',
          floor: 0.08,
          ceiling: 0.15,
          sourceSleeve: 'stock',
          sourceMinRatio: 1.0,
        },
      },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'glide-down',
    name: 'Glide path 80→40 stocks — 4%',
    description: 'Start aggressive (80/20), end conservative (40/60) over the horizon. Classic age-based de-risking.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: {
        type: 'glidepath',
        start: { stock: 0.8, bond: 0.2, cash: 0 },
        end: { stock: 0.4, bond: 0.6, cash: 0 },
        transitionYears: HORIZON,
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'rising-equity',
    name: 'Rising equity 40→80 — 4%',
    description: 'Kitces "U-shape": start conservative, raise stocks over time. Reduces sequence-of-returns damage.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: {
        type: 'glidepath',
        start: { stock: 0.4, bond: 0.6, cash: 0 },
        end: { stock: 0.8, bond: 0.2, cash: 0 },
        transitionYears: HORIZON,
      },
      withdrawal: { type: 'fixedPercent', rate: 0.04 },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
  {
    id: 'front-loaded',
    name: 'Front-loaded spend 5%→3% — 60/40',
    description: 'Spend more early (go-go years), less later (slow-go). Linear ramp from 5% in year 0 to 3% in year horizon.',
    state: {
      initialBalance: STARTING,
      horizonYears: HORIZON,
      allocation: flatStatic(0.6, 0.4, 0),
      withdrawal: {
        type: 'piecewiseLinear',
        points: [
          { t: 0, rate: 0.05 },
          { t: HORIZON / 2, rate: 0.04 },
          { t: HORIZON - 1, rate: 0.03 },
        ],
      },
      withdrawalSource: { type: 'proportional', rebalance: true },
      tailMethod: { type: 'truncate' },
      axes: PINNED_AXES,
    },
  },
];
