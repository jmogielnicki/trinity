import * as Comlink from 'comlink';
import {
  solveMaxSafeRate,
  solveMinBalance,
  type BalanceSolveResult,
  type RateSolveResult,
} from '../engine/solve';
import { runScenario, type Scenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';

let cachedData: HistoricalSeries | null = null;

const api = {
  setData(d: HistoricalSeries) {
    cachedData = d;
  },
  runScenario(scenario: Scenario): ScenarioResult {
    if (!cachedData) throw new Error('worker: data not initialized');
    return runScenario(scenario, cachedData);
  },
  runMany(scenarios: Scenario[]): ScenarioResult[] {
    if (!cachedData) throw new Error('worker: data not initialized');
    return scenarios.map((s) => runScenario(s, cachedData!));
  },
  solveSafeRate(scenario: Scenario, target?: number): RateSolveResult {
    if (!cachedData) throw new Error('worker: data not initialized');
    return solveMaxSafeRate(scenario, cachedData, target);
  },
  solveNumber(scenario: Scenario, target?: number): BalanceSolveResult {
    if (!cachedData) throw new Error('worker: data not initialized');
    return solveMinBalance(scenario, cachedData, target);
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
