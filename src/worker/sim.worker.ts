import * as Comlink from 'comlink';
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
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
