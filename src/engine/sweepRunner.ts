import { runScenario, type Scenario } from './sweep';
import type { AllocationStrategy, WithdrawalStrategy } from './strategies';
import type { HistoricalSeries, ScenarioResult } from './types';
import {
  axisValues,
  type Axis,
  type AxisMode,
} from '../store/sweepStore';

export type BaseScenario = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
};

export type GridCell = {
  axisValues: Record<Axis, number | undefined>;
  result: ScenarioResult;
};

export type SweepGrid = {
  axes: Axis[];
  values: Record<Axis, number[]>;
  cells: GridCell[];
};

export type SweepPlan = {
  axes: Axis[];
  values: Record<Axis, number[]>;
  scenarios: Scenario[];
  axisValuesPerCell: Array<Record<Axis, number | undefined>>;
};

function applyAxis(
  base: BaseScenario,
  axis: Axis,
  value: number,
): BaseScenario {
  switch (axis) {
    case 'withdrawalRate':
      return { ...base, withdrawal: { type: 'fixedPercent', rate: value } };
    case 'stockPct':
      return {
        ...base,
        allocation: {
          type: 'static',
          weights: { stock: value, bond: 1 - value, cash: 0 },
        },
      };
    case 'horizon':
      return { ...base, horizonYears: value };
  }
}

const EMPTY_AXIS_VALUES: Record<Axis, number | undefined> = {
  withdrawalRate: undefined,
  stockPct: undefined,
  horizon: undefined,
};

/**
 * Build the list of scenarios a sweep needs to run, without actually running
 * them. Lets a worker pool parallelize the execution.
 */
export function planSweep(
  base: BaseScenario,
  axesConfig: Record<Axis, AxisMode>,
): SweepPlan {
  const sweeping = (Object.keys(axesConfig) as Axis[]).filter(
    (a) => axesConfig[a].mode === 'sweep',
  );
  const values: Record<Axis, number[]> = {
    withdrawalRate: axisValues(axesConfig.withdrawalRate),
    stockPct: axisValues(axesConfig.stockPct),
    horizon: axisValues(axesConfig.horizon),
  };

  if (sweeping.length === 0) {
    return {
      axes: [],
      values,
      scenarios: [base],
      axisValuesPerCell: [{ ...EMPTY_AXIS_VALUES }],
    };
  }

  const scenarios: Scenario[] = [];
  const axisValuesPerCell: Array<Record<Axis, number | undefined>> = [];

  if (sweeping.length === 1) {
    const a = sweeping[0];
    for (const v of values[a]) {
      scenarios.push(applyAxis(base, a, v));
      axisValuesPerCell.push({ ...EMPTY_AXIS_VALUES, [a]: v });
    }
  } else {
    const [a1, a2] = sweeping;
    for (const v1 of values[a1]) {
      for (const v2 of values[a2]) {
        scenarios.push(applyAxis(applyAxis(base, a1, v1), a2, v2));
        axisValuesPerCell.push({
          ...EMPTY_AXIS_VALUES,
          [a1]: v1,
          [a2]: v2,
        });
      }
    }
  }

  return { axes: sweeping, values, scenarios, axisValuesPerCell };
}

/** Glue plan + results back together into a SweepGrid for the UI. */
export function assembleGrid(
  plan: SweepPlan,
  results: ScenarioResult[],
): SweepGrid {
  return {
    axes: plan.axes,
    values: plan.values,
    cells: plan.scenarios.map((_, i) => ({
      axisValues: plan.axisValuesPerCell[i],
      result: results[i],
    })),
  };
}

/** Convenience for tests / non-worker callers. */
export function runSweep(
  base: BaseScenario,
  axesConfig: Record<Axis, AxisMode>,
  data: HistoricalSeries,
): SweepGrid {
  const plan = planSweep(base, axesConfig);
  const results = plan.scenarios.map((s) => runScenario(s, data));
  return assembleGrid(plan, results);
}
