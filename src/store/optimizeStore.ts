import { create } from 'zustand';
import {
  candidateToScenario,
  metricsFromResult,
  paretoFront,
  type CandidateResult,
  type OptimizeConfig,
} from '../engine/optimize';
import {
  DEFAULT_STUDY,
  generateStudy,
  type StudyAxis,
  type StudyConfig,
} from '../engine/study';
import type { SimPool } from '../worker/pool';

export type OptimizeState = {
  /** Study configuration that defines the candidate set. */
  study: StudyConfig;
  /** True when the study has changed since the last search — results are stale. */
  studyDirty: boolean;
  /** All candidates with metrics (unfiltered), row-major for 2D studies. */
  results: CandidateResult[];
  /** Swept-dimension axes from the last run — 1 entry for 1D, 2 for 2D. */
  axes: StudyAxis[];
  /** Pareto front recomputed against the currently-filtered set. */
  frontier: CandidateResult[];
  selectedIds: string[];
  /** Minimum success rate, [0, 1]. Strategies below this are hidden + excluded from the frontier. */
  minSuccessRate: number;
  running: boolean;
  computeMs: number;
  lastConfig: OptimizeConfig | null;
  setStudy: (study: StudyConfig) => void;
  run: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  selectAllFrontier: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  setMinSuccessRate: (v: number) => void;
  reset: () => void;
};

/** Cap on how many candidates are auto-selected into the comparison. */
const AUTO_SELECT_CAP = 24;

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
    study: DEFAULT_STUDY,
    studyDirty: false,
    results: [],
    axes: [],
    frontier: [],
    selectedIds: [],
    minSuccessRate: 0,
    running: false,
    computeMs: 0,
    lastConfig: null,

    setStudy(study) {
      set({ study, studyDirty: true });
    },

    async run(cfg, pool) {
      const myId = ++pendingId;
      set({ running: true });
      const t0 = performance.now();
      const { candidates, axes } = generateStudy(get().study);
      const scenarios = candidates.map((c) => candidateToScenario(c, cfg));
      const scenarioResults = await pool.runMany(scenarios);
      if (myId !== pendingId) return;
      const results: CandidateResult[] = candidates.map((c, i) => ({
        candidate: c,
        metrics: metricsFromResult(scenarioResults[i], cfg.initialBalance),
        result: scenarioResults[i],
      }));
      const minSuccessRate = get().minSuccessRate;
      const frontier = filterAndFront(results, minSuccessRate);
      // The point of a study is to compare every variant tried, so pre-select
      // them all (capped) rather than just the frontier subset.
      const initialSelected = results
        .slice(0, AUTO_SELECT_CAP)
        .map((r) => r.candidate.id);
      set({
        results,
        axes,
        frontier,
        selectedIds: initialSelected,
        running: false,
        studyDirty: false,
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

    selectAll() {
      set({ selectedIds: get().results.map((r) => r.candidate.id) });
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
        study: DEFAULT_STUDY,
        studyDirty: false,
        results: [],
        axes: [],
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
