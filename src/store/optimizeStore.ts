import { create } from 'zustand';
import {
  candidateToScenario,
  generateCandidates,
  metricsFromResult,
  paretoFront,
  type Candidate,
  type CandidateResult,
  type OptimizeConfig,
} from '../engine/optimize';
import type { SimPool } from '../worker/pool';

export type OptimizeState = {
  /** All candidates with metrics (unfiltered). */
  results: CandidateResult[];
  /** Pareto front recomputed against the currently-filtered set. */
  frontier: CandidateResult[];
  selectedIds: string[];
  /** Minimum success rate, [0, 1]. Strategies below this are hidden + excluded from the frontier. */
  minSuccessRate: number;
  running: boolean;
  computeMs: number;
  lastConfig: OptimizeConfig | null;
  run: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  selectAllFrontier: () => void;
  clearSelection: () => void;
  setMinSuccessRate: (v: number) => void;
  reset: () => void;
};

const FRONTIER_PRESELECT = 10;

function filterAndFront(
  results: CandidateResult[],
  minSuccessRate: number,
): CandidateResult[] {
  const passing = results.filter(
    (r) => Number.isFinite(r.metrics.successRate) && r.metrics.successRate >= minSuccessRate,
  );
  return paretoFront(passing);
}

export const useOptimizeStore = create<OptimizeState>((set, get) => {
  let pendingId = 0;
  return {
    results: [],
    frontier: [],
    selectedIds: [],
    minSuccessRate: 0,
    running: false,
    computeMs: 0,
    lastConfig: null,

    async run(cfg, pool) {
      const myId = ++pendingId;
      set({ running: true });
      const t0 = performance.now();
      const candidates: Candidate[] = generateCandidates();
      const scenarios = candidates.map((c) => candidateToScenario(c, cfg));
      const scenarioResults = await pool.runMany(scenarios);
      if (myId !== pendingId) return;
      const results: CandidateResult[] = candidates.map((c, i) => ({
        candidate: c,
        metrics: metricsFromResult(scenarioResults[i], cfg.initialBalance),
      }));
      const minSuccessRate = get().minSuccessRate;
      const frontier = filterAndFront(results, minSuccessRate);
      // Pre-select up to ~10 frontier strategies, spread across it.
      const step = Math.max(1, Math.ceil(frontier.length / FRONTIER_PRESELECT));
      const initialSelected: string[] = [];
      for (let i = 0; i < frontier.length && initialSelected.length < FRONTIER_PRESELECT; i += step) {
        initialSelected.push(frontier[i].candidate.id);
      }
      set({
        results,
        frontier,
        selectedIds: initialSelected,
        running: false,
        computeMs: performance.now() - t0,
        lastConfig: cfg,
      });
    },

    toggleSelected(id) {
      const cur = get().selectedIds;
      if (cur.includes(id)) {
        set({ selectedIds: cur.filter((x) => x !== id) });
      } else {
        set({ selectedIds: [...cur, id] });
      }
    },

    setSelected(ids) {
      set({ selectedIds: ids });
    },

    selectAllFrontier() {
      const frontier = get().frontier;
      set({ selectedIds: frontier.map((r) => r.candidate.id) });
    },

    clearSelection() {
      set({ selectedIds: [] });
    },

    setMinSuccessRate(v) {
      const clamped = Math.max(0, Math.min(1, v));
      const { results } = get();
      const frontier = filterAndFront(results, clamped);
      set({ minSuccessRate: clamped, frontier });
    },

    reset() {
      pendingId++;
      set({
        results: [],
        frontier: [],
        selectedIds: [],
        minSuccessRate: 0,
        running: false,
        computeMs: 0,
        lastConfig: null,
      });
    },
  };
});
