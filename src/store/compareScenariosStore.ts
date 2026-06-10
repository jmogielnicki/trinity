import { create } from 'zustand';
import type { IncomeStream, OneTimeCashflow } from '../engine/cashflows';
import { metricsFromResult, type CandidateMetrics } from '../engine/optimize';
import type { Scenario } from '../engine/sweep';
import type { ScenarioResult } from '../engine/types';
import type { SavedScenario } from './libraryStore';
import type { SimPool } from '../worker/pool';

export type CompareEntry = {
  saved: SavedScenario;
  result: ScenarioResult;
  metrics: CandidateMetrics;
  /** Effective balance/horizon used for this run — global, from the page inputs. */
  initialBalance: number;
  horizonYears: number;
};

/**
 * Personal circumstances are global (the page inputs), applied to every
 * scenario: balance, horizon, and external cash flows. Compared plans differ
 * by strategy, not by who is retiring.
 */
export type CompareOverride = {
  initialBalance: number;
  horizonYears: number;
  incomes?: IncomeStream[];
  cashflows?: OneTimeCashflow[];
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
  run: (saved: SavedScenario[], pool: SimPool, override: CompareOverride) => Promise<void>;
};

export const COMPARE_MAX = 5;

function savedToScenario(s: SavedScenario, override: CompareOverride): Scenario {
  const st = s.state;
  return {
    initialBalance: override.initialBalance,
    horizonYears: override.horizonYears,
    allocation: st.allocation,
    withdrawal: st.withdrawal,
    withdrawalSource: st.withdrawalSource,
    incomes: override.incomes,
    cashflows: override.cashflows,
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

      async run(saved, pool, override) {
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
        const scenarios = picked.map((s) => savedToScenario(s, override));
        const results = await pool.runMany(scenarios);
        if (myId !== pendingId) return;
        const entries: CompareEntry[] = picked.map((s, i) => ({
          saved: s,
          result: results[i],
          metrics: metricsFromResult(results[i], scenarios[i].initialBalance),
          initialBalance: override.initialBalance,
          horizonYears: override.horizonYears,
        }));
        set({ entries, running: false, computeMs: performance.now() - t0 });
      },
    };
  },
);
