import * as Comlink from 'comlink';
import { runScenario, type Scenario } from '../engine/sweep';
import { metricsFromResult, type CandidateMetrics } from '../engine/optimize';
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
   * Run a batch but return ONLY the (tiny) metrics of candidates whose success
   * rate clears `minSuccessRate` — never the full ScenarioResult. This is what
   * makes large auto-mode sweeps survivable: a passing candidate's heavy
   * per-year trajectories are computed, reduced to a handful of numbers, and
   * then discarded inside the worker, so the main thread only ever holds
   * metrics. Full results for the few candidates the user actually inspects
   * are re-simulated on demand via `runScenario`. Each passer carries its
   * local index so the caller can map it back to the originating candidate.
   */
  runManyMetrics(
    scenarios: Scenario[],
    minSuccessRate: number,
    initialBalance: number,
  ): Array<{ local: number; metrics: CandidateMetrics }> {
    if (!cachedData) throw new Error('worker: data not initialized');
    const out: Array<{ local: number; metrics: CandidateMetrics }> = [];
    for (let i = 0; i < scenarios.length; i++) {
      const result = runScenario(scenarios[i], cachedData);
      // Same rate metricsFromResult reports: projected (bootstrap) when
      // present, otherwise the observed historical rate.
      const sr = result.projectedSuccessRate ?? result.successRate;
      if (Number.isFinite(sr) && sr >= minSuccessRate) {
        out.push({ local: i, metrics: metricsFromResult(result, initialBalance) });
      }
      // `result` falls out of scope here and is collected — never serialized.
    }
    return out;
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
