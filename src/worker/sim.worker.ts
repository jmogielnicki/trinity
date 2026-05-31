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
  /**
   * Run a batch but only return the results whose success rate clears
   * `minSuccessRate`. Filtering here — before anything crosses the worker
   * boundary — is what makes large auto-mode sweeps (tens of thousands of
   * candidates) survivable: the heavy per-year trajectories of failing
   * candidates are discarded the moment we know they fail, so only the
   * passing set is ever serialized back to and retained on the main thread.
   * Each passer carries its local index so the caller can map it back to the
   * originating candidate.
   */
  runManyFiltered(
    scenarios: Scenario[],
    minSuccessRate: number,
  ): Array<{ local: number; result: ScenarioResult }> {
    if (!cachedData) throw new Error('worker: data not initialized');
    const out: Array<{ local: number; result: ScenarioResult }> = [];
    for (let i = 0; i < scenarios.length; i++) {
      const result = runScenario(scenarios[i], cachedData);
      // Same rate metricsFromResult reports: projected (bootstrap) when
      // present, otherwise the observed historical rate.
      const sr = result.projectedSuccessRate ?? result.successRate;
      if (Number.isFinite(sr) && sr >= minSuccessRate) {
        out.push({ local: i, result });
      }
    }
    return out;
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
