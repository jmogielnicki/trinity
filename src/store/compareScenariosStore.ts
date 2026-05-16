import { create } from 'zustand';
import { metricsFromResult, type CandidateMetrics } from '../engine/optimize';
import type { Scenario } from '../engine/sweep';
import type { ScenarioResult } from '../engine/types';
import type { SavedScenario } from './libraryStore';
import type { SimPool } from '../worker/pool';

export type CompareEntry = {
  saved: SavedScenario;
  result: ScenarioResult;
  metrics: CandidateMetrics;
};

export type CompareScenariosState = {
  /** ids of saved scenarios picked for comparison (also defines series order). */
  selectedIds: string[];
  entries: CompareEntry[];
  running: boolean;
  computeMs: number;
  toggle: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clear: () => void;
  run: (saved: SavedScenario[], pool: SimPool) => Promise<void>;
};

export const COMPARE_MAX = 10;

function savedToScenario(s: SavedScenario): Scenario {
  const st = s.state;
  return {
    initialBalance: st.initialBalance,
    horizonYears: st.horizonYears,
    allocation: st.allocation,
    withdrawal: st.withdrawal,
    withdrawalSource: st.withdrawalSource,
    tailMethod: st.tailMethod ?? { type: 'truncate' },
  };
}

export const useCompareScenariosStore = create<CompareScenariosState>(
  (set, get) => {
    let pendingId = 0;
    return {
      selectedIds: [],
      entries: [],
      running: false,
      computeMs: 0,

      toggle(id) {
        const cur = get().selectedIds;
        if (cur.includes(id)) {
          set({ selectedIds: cur.filter((x) => x !== id) });
        } else if (cur.length < COMPARE_MAX) {
          set({ selectedIds: [...cur, id] });
        }
      },

      setSelection(ids) {
        set({ selectedIds: ids.slice(0, COMPARE_MAX) });
      },

      clear() {
        set({ selectedIds: [], entries: [] });
      },

      async run(saved, pool) {
        const picked = get()
          .selectedIds.map((id) => saved.find((s) => s.id === id))
          .filter((s): s is SavedScenario => !!s);
        if (picked.length === 0) {
          set({ entries: [], computeMs: 0 });
          return;
        }
        const myId = ++pendingId;
        set({ running: true });
        const t0 = performance.now();
        const scenarios = picked.map(savedToScenario);
        const results = await pool.runMany(scenarios);
        if (myId !== pendingId) return;
        const entries: CompareEntry[] = picked.map((s, i) => ({
          saved: s,
          result: results[i],
          metrics: metricsFromResult(results[i], scenarios[i].initialBalance),
        }));
        set({ entries, running: false, computeMs: performance.now() - t0 });
      },
    };
  },
);
