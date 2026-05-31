import * as Comlink from 'comlink';
import type { Scenario } from '../engine/sweep';
import type { HistoricalSeries, ScenarioResult } from '../engine/types';
import type { SimWorkerApi } from './sim.worker';

export type SimPool = {
  setData: (d: HistoricalSeries) => Promise<void>;
  runScenario: (s: Scenario) => Promise<ScenarioResult>;
  runMany: (scenarios: Scenario[]) => Promise<ScenarioResult[]>;
  /**
   * Run scenarios but only return those whose success rate clears
   * `minSuccessRate`, each tagged with its original index. Failing candidates'
   * heavy results are discarded inside the workers, so this stays within
   * memory even for tens of thousands of candidates (auto mode).
   */
  runManyFiltered: (
    scenarios: Scenario[],
    minSuccessRate: number,
  ) => Promise<Array<{ index: number; result: ScenarioResult }>>;
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

    async runManyFiltered(scenarios, minSuccessRate) {
      if (scenarios.length === 0) return [];
      // Round-robin distribute, remembering each scenario's global index so we
      // can map a worker's local passer index back to the original candidate.
      const buckets: Scenario[][] = apis.map(() => []);
      const globalIndices: number[][] = apis.map(() => []);
      scenarios.forEach((s, i) => {
        const b = i % apis.length;
        buckets[b].push(s);
        globalIndices[b].push(i);
      });
      const perWorker = await Promise.all(
        apis.map((a, i) =>
          buckets[i].length
            ? a.runManyFiltered(buckets[i], minSuccessRate)
            : Promise.resolve([]),
        ),
      );
      const out: Array<{ index: number; result: ScenarioResult }> = [];
      perWorker.forEach((passers, b) => {
        for (const { local, result } of passers) {
          out.push({ index: globalIndices[b][local], result });
        }
      });
      // Stable original order so selection/curation is deterministic.
      out.sort((a, c) => a.index - c.index);
      return out;
    },

    destroy() {
      for (const w of workers) w.terminate();
    },
  };
}
