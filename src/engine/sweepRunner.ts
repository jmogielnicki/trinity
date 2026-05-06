import { runScenario } from './sweep';
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

/**
 * Apply a swept axis value to the base scenario. Sweeping `withdrawalRate`
 * overrides the user's curve with a flat fixedPercent. Sweeping `stockPct`
 * overrides the glide path with a flat static allocation (bonds = 1 - stock).
 */
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

export function runSweep(
  base: BaseScenario,
  axesConfig: Record<Axis, AxisMode>,
  data: HistoricalSeries,
): SweepGrid {
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
      cells: [
        {
          axisValues: {
            withdrawalRate: undefined,
            stockPct: undefined,
            horizon: undefined,
          },
          result: runScenario(base, data),
        },
      ],
    };
  }

  const cells: GridCell[] = [];
  if (sweeping.length === 1) {
    const a = sweeping[0];
    for (const v of values[a]) {
      const s = applyAxis(base, a, v);
      cells.push({
        axisValues: {
          withdrawalRate: a === 'withdrawalRate' ? v : undefined,
          stockPct: a === 'stockPct' ? v : undefined,
          horizon: a === 'horizon' ? v : undefined,
        },
        result: runScenario(s, data),
      });
    }
  } else {
    const [a1, a2] = sweeping;
    for (const v1 of values[a1]) {
      for (const v2 of values[a2]) {
        const s = applyAxis(applyAxis(base, a1, v1), a2, v2);
        cells.push({
          axisValues: {
            withdrawalRate:
              a1 === 'withdrawalRate'
                ? v1
                : a2 === 'withdrawalRate'
                  ? v2
                  : undefined,
            stockPct:
              a1 === 'stockPct' ? v1 : a2 === 'stockPct' ? v2 : undefined,
            horizon: a1 === 'horizon' ? v1 : a2 === 'horizon' ? v2 : undefined,
          },
          result: runScenario(s, data),
        });
      }
    }
  }

  return { axes: sweeping, values, cells };
}
