import * as Comlink from 'comlink';
import type {
  BalanceSolveResult,
  RateSolveResult,
} from '../engine/solve';
import type { Scenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import type { SimWorkerApi } from './sim.worker';

export type SimPool = {
  setData: (d: HistoricalSeries) => Promise<void>;
  runScenario: (s: Scenario) => Promise<ScenarioResult>;
  runMany: (scenarios: Scenario[]) => Promise<ScenarioResult[]>;
  solveSafeRate: (s: Scenario, target?: number) => Promise<RateSolveResult>;
  solveNumber: (s: Scenario, target?: number) => Promise<BalanceSolveResult>;
  size: number;
  destroy: () => void;
};

export function createPool(size?: number): SimPool {
  const n = Math.max(
    1,
    size ?? Math.min(8, navigator.hardwareConcurrency || 4),
  );
  const workers = Array.from(
    { length: n },
    () =>
      new Worker(new URL('./sim.worker.ts', import.meta.url), {
        type: 'module',
      }),
  );
  const apis = workers.map((w) => Comlink.wrap<SimWorkerApi>(w));

  return {
    size: n,

    async setData(data) {
      await Promise.all(apis.map((a) => a.setData(data)));
    },

    runScenario(s) {
      return apis[0].runScenario(s);
    },

    // Bisection solves are ~20–40 runScenario calls — cheap, and serial by
    // nature — so they run on a single worker, keeping the main thread free.
    solveSafeRate(s, target) {
      return apis[0].solveSafeRate(s, target);
    },

    solveNumber(s, target) {
      return apis[0].solveNumber(s, target);
    },

    async runMany(scenarios) {
      if (scenarios.length === 0) return [];
      // Round-robin distribute. Workers run synchronously inside; we just
      // need each worker to get roughly an equal slice.
      const buckets: Scenario[][] = apis.map(() => []);
      const bucketIndex: number[] = [];
      scenarios.forEach((s, i) => {
        const b = i % apis.length;
        buckets[b].push(s);
        bucketIndex.push(b);
      });
      const results = await Promise.all(
        apis.map((a, i) =>
          buckets[i].length ? a.runMany(buckets[i]) : Promise.resolve([]),
        ),
      );
      // Reassemble in original order.
      const cursors = apis.map(() => 0);
      const out: ScenarioResult[] = new Array(scenarios.length);
      for (let i = 0; i < scenarios.length; i++) {
        const b = bucketIndex[i];
        out[i] = results[b][cursors[b]++];
      }
      return out;
    },

    destroy() {
      for (const w of workers) w.terminate();
    },
  };
}
