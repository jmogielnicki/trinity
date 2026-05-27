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
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from '../engine/strategies';
import type { WithdrawalSource } from '../engine/withdrawalSource';
import type { SimPool } from '../worker/pool';

/** A base strategy loaded into the study as the pinned baseline. */
export type StudyBase = {
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  source: WithdrawalSource;
  label: string;
};

export type OptimizeState = {
  /** Study configuration that defines the candidate set. */
  study: StudyConfig;
  /**
   * Name of the preset / saved strategy the pinned baseline was loaded from,
   * or null once the user edits the study away from it.
   */
  baseLabel: string | null;
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
  /** Load a preset / saved strategy as the pinned baseline for all dimensions. */
  loadBase: (base: StudyBase) => void;
  run: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  selectAllFrontier: () => void;
  /** Re-pick an evenly-spaced set of up to OVERLAY_MAX variants to overlay. */
  autoCurate: () => void;
  clearSelection: () => void;
  setMinSuccessRate: (v: number) => void;
  reset: () => void;
};

/** Max # of variants overlaid in the compare-style charts at once. */
export const OVERLAY_MAX = 8;

/** Pick up to `max` items evenly spaced across the list (always incl. ends). */
function evenlySpaced<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr.slice();
  const picked: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (arr.length - 1)) / (max - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(arr[idx]);
    }
  }
  return picked;
}

function curate(results: CandidateResult[], axes: { length: number }): string[] {
  // Only 1D studies use the overlay; 2D studies read the heatmap instead.
  if (axes.length !== 1) return [];
  return evenlySpaced(
    results.map((r) => r.candidate.id),
    OVERLAY_MAX,
  );
}


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
    baseLabel: null,
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
      // Any manual edit detaches the study from the base it was loaded from.
      set({ study, studyDirty: true, baseLabel: null });
    },

    loadBase(base) {
      set((s) => ({
        study: {
          ...s.study,
          lockedAllocation: base.allocation,
          lockedWithdrawal: base.withdrawal,
          lockedSource: base.source,
        },
        baseLabel: base.label,
        studyDirty: true,
      }));
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
      set({
        results,
        axes,
        frontier,
        selectedIds: curate(results, axes),
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
        // Cap the overlay; adding past the cap drops the oldest selection.
        set({ selectedIds: [...cur, id].slice(-OVERLAY_MAX) });
      }
    },

    setSelected(ids) {
      set({ selectedIds: evenlySpaced(ids, OVERLAY_MAX) });
    },

    selectAllFrontier() {
      const frontier = get().frontier;
      set({
        selectedIds: evenlySpaced(
          frontier.map((r) => r.candidate.id),
          OVERLAY_MAX,
        ),
      });
    },

    autoCurate() {
      const { results, axes } = get();
      set({ selectedIds: curate(results, axes) });
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
        baseLabel: null,
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
