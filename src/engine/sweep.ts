import { bootstrapTail, hashSeed, makeRng } from './bootstrap';
import { simulate } from './simulate';
import {
  completedSuccessRate,
  computePercentiles,
} from './stats';
import type { AllocationStrategy, WithdrawalStrategy } from './strategies';
import type {
  AnnualReturns,
  HistoricalSeries,
  ScenarioResult,
  SimulationResult,
} from './types';
import type { WithdrawalSource } from './withdrawalSource';

export type TailMethod =
  | { type: 'truncate' }
  | { type: 'bootstrap'; blockYears: number; samplesPerPrefix: number };

export type Scenario = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  withdrawalSource?: WithdrawalSource;
  tailMethod?: TailMethod;
  seed?: number;
  /**
   * Restrict start years for the sweep. Defaults to all years where
   * `startYear + horizonYears <= data.end + 1` (truncate also extends past
   * that, marked inProgress).
   */
  startYearRange?: { from: number; to: number };
};

const DEFAULT_TAIL: TailMethod = { type: 'truncate' };

function returnsForRange(
  data: HistoricalSeries,
  startYear: number,
  horizon: number,
): AnnualReturns[] {
  const out: AnnualReturns[] = [];
  for (let y = startYear; y < startYear + horizon; y++) {
    const r = data.byYear.get(y);
    if (!r) break;
    out.push(r);
  }
  return out;
}

export function runScenario(
  scenario: Scenario,
  data: HistoricalSeries,
): ScenarioResult {
  const tail = scenario.tailMethod ?? DEFAULT_TAIL;
  const seed =
    scenario.seed ?? hashSeed(JSON.stringify(scenario, replacerSkipFn));
  const range = scenario.startYearRange ?? { from: data.start, to: data.end };

  const sims: SimulationResult[] = [];

  for (let startYear = range.from; startYear <= range.to; startYear++) {
    const observed = returnsForRange(data, startYear, scenario.horizonYears);
    if (observed.length === 0) continue;

    const isComplete = observed.length === scenario.horizonYears;

    if (isComplete) {
      sims.push(
        simulate({
          startYear,
          initialBalance: scenario.initialBalance,
          horizonYears: scenario.horizonYears,
          allocation: scenario.allocation,
          withdrawal: scenario.withdrawal,
          withdrawalSource: scenario.withdrawalSource,
          returns: observed,
        }),
      );
      continue;
    }

    if (tail.type === 'truncate') {
      sims.push(
        simulate({
          startYear,
          initialBalance: scenario.initialBalance,
          horizonYears: scenario.horizonYears,
          allocation: scenario.allocation,
          withdrawal: scenario.withdrawal,
          withdrawalSource: scenario.withdrawalSource,
          returns: observed,
          prefixYears: observed.length,
        }),
      );
    } else {
      const rng = makeRng(seed ^ startYear);
      for (let s = 0; s < tail.samplesPerPrefix; s++) {
        const tailReturns = bootstrapTail(
          observed.length,
          scenario.horizonYears,
          data.years,
          tail.blockYears,
          rng,
        );
        const full = [...observed, ...tailReturns];
        sims.push(
          simulate({
            startYear,
            initialBalance: scenario.initialBalance,
            horizonYears: scenario.horizonYears,
            allocation: scenario.allocation,
            withdrawal: scenario.withdrawal,
            withdrawalSource: scenario.withdrawalSource,
            returns: full,
            bootstrapped: true,
            prefixYears: observed.length,
          }),
        );
      }
    }
  }

  const { rate, completed, inProgress } = completedSuccessRate(sims);
  const percentiles = computePercentiles(sims, scenario.horizonYears);
  const failed = sims.find((s) => !s.success && !s.inProgress);

  return {
    sims,
    successRate: rate,
    completedCount: completed,
    inProgressCount: inProgress,
    percentiles,
    worstStartYear: failed?.startYear,
  };
}

export function sweep1d<K extends keyof Scenario>(
  base: Scenario,
  dimension: K,
  values: Array<Scenario[K]>,
  data: HistoricalSeries,
): Array<{ value: Scenario[K]; result: ScenarioResult }> {
  return values.map((value) => ({
    value,
    result: runScenario({ ...base, [dimension]: value }, data),
  }));
}

function replacerSkipFn(_k: string, v: unknown) {
  return typeof v === 'function' ? undefined : v;
}
