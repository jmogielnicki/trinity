import * as Comlink from 'comlink';
import { runScenario, type Scenario, type TailMethod } from '../engine/sweep';
import {
  candidateToScenario,
  metricsFromResult,
  type Candidate,
  type CandidateMetrics,
} from '../engine/optimize';
import {
  autoLadderRungs,
  buildAutoLadderCandidate,
  type AutoLadder,
} from '../engine/study';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';

let cachedData: HistoricalSeries | null = null;

export type AutoLadderResult = { candidate: Candidate; metrics: CandidateMetrics };

export type AutoLadderOpts = {
  horizonYears: number;
  initialBalance: number;
  tailMethod?: TailMethod;
  minSuccessRate: number;
};

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
   * Run a set of auto-mode ladders with early termination. Each ladder climbs
   * its withdrawal rate from the floor upward; because higher withdrawals can
   * only lower success, the climb stops the instant a rung drops below
   * `minSuccessRate` (every higher rung would fail too). Only the (tiny)
   * metrics of passing rungs are returned — the heavy ScenarioResult is
   * computed, reduced, and discarded inside the worker, so the main thread
   * never holds tens of thousands of trajectory sets. `onProgress` is called
   * with this worker's running simulation count, throttled.
   */
  runAutoLadders(
    ladders: AutoLadder[],
    opts: AutoLadderOpts,
    onProgress?: (simsRun: number) => void,
  ): AutoLadderResult[] {
    if (!cachedData) throw new Error('worker: data not initialized');
    const out: AutoLadderResult[] = [];
    let simsRun = 0;
    let lastReport = 0;
    const report = (force: boolean) => {
      // Throttle so Comlink isn't flooded: every 50 sims (or at the end).
      if (onProgress && (force || simsRun - lastReport >= 50)) {
        lastReport = simsRun;
        onProgress(simsRun);
      }
    };
    for (const ladder of ladders) {
      for (const rate of autoLadderRungs(ladder)) {
        const candidate = buildAutoLadderCandidate(ladder, rate, opts.horizonYears);
        const result = runScenario(
          candidateToScenario(candidate, opts),
          cachedData,
        );
        simsRun++;
        const sr = result.projectedSuccessRate ?? result.successRate;
        if (Number.isFinite(sr) && sr >= opts.minSuccessRate) {
          out.push({ candidate, metrics: metricsFromResult(result, opts.initialBalance) });
          report(false);
        } else {
          // This rung missed — no higher rate in this ladder can pass. Stop.
          report(false);
          break;
        }
      }
    }
    report(true);
    return out;
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
