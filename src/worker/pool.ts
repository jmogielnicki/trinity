import * as Comlink from 'comlink';
import type { Scenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import type { AutoLadder } from '../engine/study';
import type { AutoLadderOpts, AutoLadderResult, SimWorkerApi } from './sim.worker';

export type SimPool = {
  setData: (d: HistoricalSeries) => Promise<void>;
  runScenario: (s: Scenario) => Promise<ScenarioResult>;
  runMany: (scenarios: Scenario[]) => Promise<ScenarioResult[]>;
  /**
   * Run auto-mode ladders with early termination across all workers, returning
   * only the lightweight metrics of passing rungs. `onProgress` receives the
   * total simulations run so far across every worker (for a progress bar).
   */
  runAutoLadders: (
    ladders: AutoLadder[],
    opts: AutoLadderOpts,
    onProgress?: (simsRun: number) => void,
  ) => Promise<AutoLadderResult[]>;
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

    async runAutoLadders(ladders, opts, onProgress) {
      if (ladders.length === 0) return [];
      // Round-robin ladders across workers. Each worker reports its own running
      // sim count; we sum the latest from each for a global total.
      const buckets: AutoLadder[][] = apis.map(() => []);
      ladders.forEach((l, i) => buckets[i % apis.length].push(l));
      const perWorkerCounts = apis.map(() => 0);
      const emit = () => {
        if (onProgress) {
          onProgress(perWorkerCounts.reduce((a, b) => a + b, 0));
        }
      };
      const perWorker = await Promise.all(
        apis.map((a, i) =>
          buckets[i].length
            ? a.runAutoLadders(
                buckets[i],
                opts,
                Comlink.proxy((simsRun: number) => {
                  perWorkerCounts[i] = simsRun;
                  emit();
                }),
              )
            : Promise.resolve([] as AutoLadderResult[]),
        ),
      );
      return perWorker.flat();
    },

    destroy() {
      for (const w of workers) w.terminate();
    },
  };
}
