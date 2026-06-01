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
		id: "trinity-75-25",
		name: "Trinity 75/25 — 4%",
		description:
			"Trinity Study (Cooley, Hubbard, Walz 1998). 75/25, 4%, ~95% historical success.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.75, 0.25, 0),
			withdrawal: { type: "fixedPercent", rate: 0.04 },
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "aggressive-100",
		name: "Aggressive 100/0 — 3.5%",
		description:
			"All stocks, no bonds. Fewer failures historically but bigger drawdowns.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(1, 0, 0),
			withdrawal: { type: "fixedPercent", rate: 0.035 },
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "ratchet-swr",
		name: "Ratcheting SWR 3.5% — 70/20/10",
		description:
			"Start conservatively at 3.25% (inflation-adjusted). Each time the portfolio grows 10% above " +
			"its starting value, permanently raise real spending by 5%. Gains are locked in — " +
			"a subsequent crash does not cut the elevated floor.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.7, 0.2, 0.1),
			withdrawal: {
				type: "ratchet",
				baseRate: 0.035,
				stepSize: 0.1,
				stepBoost: 0.05,
			},
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "cash-bucket",
		name: "Cash bucket — 50/40/10 waterfall",
		description:
			"50% stocks / 40% bonds / 10% cash. Withdraw cash first, then bonds, then stocks. Sleeves drift; no auto-rebalance.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.5, 0.4, 0.1),
			withdrawal: { type: "fixedPercent", rate: 0.04 },
			withdrawalSource: {
				type: "waterfall",
				order: ["cash", "bond", "stock"],
			},
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "cash-bucket-refill",
		name: "Cash bucket with refill — 50/35/15",
		description:
			"50/35/15 stocks/bonds/cash. Spend cash first; when cash drops below 8%, sell bonds to refill cash. When bonds drop below 25% and stocks are at or above their initial value, sell stocks to refill bonds.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.5, 0.35, 0.15),
			withdrawal: { type: "fixedPercent", rate: 0.04 },
			withdrawalSource: {
				type: "bucket",
				order: ["cash", "bond", "stock"],
				refill: [
					{
						targetSleeve: "cash",
						floor: 0.08,
						ceiling: 0.15,
						sourceSleeve: "bond",
						sourceMinRatio: undefined,
					},
					{
						targetSleeve: "bond",
						floor: 0.25,
						ceiling: 0.35,
						sourceSleeve: "stock",
						sourceMinRatio: 1.0,
					},
				],
			},
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "years-bucket",
		name: "Years-of-expenses bucket — 2yr cash / 6yr bonds",
		description:
			"68/24/8 stocks/bonds/cash at 4% withdrawal ($1M → $40k/yr). " +
			"Spend cash first, then bonds, never stocks unless forced. " +
			"In positive stock years: trim stocks to refill bonds back to 6 years of expenses, " +
			"then bonds to refill cash back to 2 years. In down years: let cash and bonds absorb the spend without touching stocks.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			// At 4% of $1M = $40k/yr: 2yr cash = $80k (8%), 6yr bonds = $240k (24%), rest stocks (68%)
			allocation: flatStatic(0.68, 0.24, 0.08),
			withdrawal: { type: "fixedPercent", rate: 0.04 },
			withdrawalSource: {
				type: "bucket",
				order: ["cash", "bond", "stock"],
				refill: [
					{
						targetSleeve: "bond",
						floor: 6,
						ceiling: 6,
						floorMode: "withdrawalYears",
						sourceSleeve: "stock",
						sourceReturnGate: 0,
					},
					{
						targetSleeve: "cash",
						floor: 2,
						ceiling: 2,
						floorMode: "withdrawalYears",
						sourceSleeve: "bond",
					},
				],
			},
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "rising-equity",
		name: "Rising equity 40→80 — 4%",
		description:
			'Kitces "U-shape": start conservative, raise stocks over time. Reduces sequence-of-returns damage.',
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: {
				type: "glidepath",
				start: { stock: 0.4, bond: 0.6, cash: 0 },
				end: { stock: 0.8, bond: 0.2, cash: 0 },
				transitionYears: HORIZON,
			},
			withdrawal: { type: "fixedPercent", rate: 0.04 },
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "cape-withdrawal",
		name: "CAPE-based withdrawal — 60/40",
		description:
			"Blanchett CAPE rule: W = 1.00% + 0.5 × (1/CAPE), applied to the current balance each year. " +
			"This is the traditional CAPE-based default (e.g. cFIREsim); at today's elevated CAPE it implies a fairly conservative ~2.7% rate. " +
			"Pulls back automatically when markets are expensive and spends more when they are cheap. " +
			"CAPE data available from 1881; earlier start years use a fallback CAPE of 20.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.6, 0.4, 0),
			withdrawal: {
				type: "capeWithdrawal",
				a: 0.01,
				b: 0.5,
				fallbackCape: 20,
			},
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},

	{
		id: "guardrails-gk",
		name: "Guyton-Klinger guardrails 5% — 65/35",
		description:
			"Start at 5% of initial balance. Each year, if the current implied withdrawal rate drifts " +
			"more than 20% above the starting rate, cut spending 10%; if it drifts 20% below, raise 10%. " +
			"Spending is capped between 80% and 125% of the original amount.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.65, 0.35, 0),
			withdrawal: {
				type: "customSrc",
				src: `// Guyton-Klinger guardrails
// Start at base rate; each year adjust if implied rate drifts ±trigger from base.
const base = 0.05;    // initial withdrawal rate
const trigger = 0.2;  // drift band (±20% of base rate)
const floor = 0.8;    // min spending as fraction of base amount
const ceiling = 1.25; // max spending as fraction of base amount

const baseAmt = base * initial;
const prev = state.trajectory[state.trajectory.length - 1];
if (!prev) return baseAmt;

const impliedRate = prev.withdrawal / state.balance;
if (impliedRate > base * (1 + trigger)) return Math.max(floor * baseAmt, prev.withdrawal * 0.9);
if (impliedRate < base * (1 - trigger)) return Math.min(ceiling * baseAmt, prev.withdrawal * 1.1);
return prev.withdrawal;`,
			},
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "endowment",
		name: "Endowment method 5% — 65/35",
		description:
			"University-endowment style: withdraw 5% of the 10-year rolling average portfolio balance. " +
			"Smooths out market volatility. A 90% floor on year-over-year spending prevents severe lifestyle cuts.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.65, 0.35, 0),
			withdrawal: {
				type: "customSrc",
				src: `// Endowment method
// Withdraw rate% of the rolling lookback-year average balance.
// Floor: spending can't fall below floorFraction of last year's amount.
const rate = 0.05;
const lookbackYears = 10;
const floorFraction = 0.9;

const window = state.trajectory.slice(-lookbackYears);
const avg = window.length
  ? window.reduce((s, r) => s + r.balance, 0) / window.length
  : state.balance;
const target = rate * avg;
const prev = state.trajectory[state.trajectory.length - 1];
return prev ? Math.max(target, floorFraction * prev.withdrawal) : target;`,
			},
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
	{
		id: "vanguard-dynamic",
		name: "Vanguard dynamic spending 5% — 60/40",
		description:
			"Apply 5% to the current portfolio balance each year, then constrain the result: " +
			"spending can rise at most 5% from the prior year and fall at most 2.5%. " +
			"Adapts to markets while preventing jarring year-over-year swings.",
		state: {
			initialBalance: STARTING,
			horizonYears: HORIZON,
			allocation: flatStatic(0.6, 0.4, 0),
			withdrawal: {
				type: "customSrc",
				src: `// Vanguard Dynamic Spending
// Baseline: rate% of current balance. Constrain YoY change to [floor, ceiling].
const rate = 0.05;
const ceiling = 0.05;   // max +5% from prior year
const floor = -0.025;   // max -2.5% from prior year

const baseline = rate * state.balance;
const prev = state.trajectory[state.trajectory.length - 1];
if (!prev) return baseline;
return Math.min(
  prev.withdrawal * (1 + ceiling),
  Math.max(prev.withdrawal * (1 + floor), baseline)
);`,
			},
			withdrawalSource: { type: "proportional", rebalance: true },
			tailMethod: { type: "truncate" },
			axes: PINNED_AXES,
		},
	},
];
