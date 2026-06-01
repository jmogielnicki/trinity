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
  buildAutoLadders,
  autoLadderRungs,
  generateStudy,
  type StudyAxis,
  type StudyConfig,
} from '../engine/study';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from '../engine/strategies';
import type { WithdrawalSource } from '../engine/withdrawalSource';
import type { ScenarioResult } from '../engine/types';
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
  /**
   * The select-option value used to pick the base (`preset:<id>` or
   * `saved:<uuid>`), or null. Persisted so the dropdown restores correctly
   * after a page reload.
   */
  basePickerKey: string | null;
  /**
   * True once a base has ever been loaded in this session. Stays true even
   * after the user edits the locked baseline away from that base — used by
   * the UI to keep the sweep editor and run button visible.
   */
  hasBase: boolean;
  /** True when the study has changed since the last search — results are stale. */
  studyDirty: boolean;
  /**
   * Auto mode sweeps all three dimensions over a fixed preset grid instead of
   * the manual pin/sweep config. Replaces the study editor with a simple
   * min-withdrawal / min-success / Go panel.
   */
  autoMode: boolean;
  /** Lower bound for auto-mode withdrawal sweeps, [0, 1]. */
  minWithdrawalRate: number;
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
  /** Simulations completed so far in the active auto run (for the progress bar). */
  progressDone: number;
  /** Upper-bound simulation count for the active auto run (without early termination). */
  progressTotal: number;
  computeMs: number;
  lastConfig: OptimizeConfig | null;
  setStudy: (study: StudyConfig) => void;
  /** Load a preset / saved strategy as the pinned baseline for all dimensions. */
  loadBase: (base: StudyBase, pickerKey?: string) => void;
  run: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  /** Run the auto-mode all-dimensions sweep. */
  runAuto: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  /**
   * Re-simulate full trajectories for the given candidate ids if they're
   * missing (auto mode keeps metrics only). Used to populate overlay charts
   * for the handful of selected candidates without retaining every result.
   */
  ensureResults: (ids: string[], cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  setAutoMode: (v: boolean) => void;
  setMinWithdrawalRate: (v: number) => void;
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
    basePickerKey: null,
    hasBase: false,
    studyDirty: false,
    autoMode: false,
    minWithdrawalRate: 0.03,
    results: [],
    axes: [],
    frontier: [],
    selectedIds: [],
    minSuccessRate: 0,
    running: false,
    progressDone: 0,
    progressTotal: 0,
    computeMs: 0,
    lastConfig: null,

    setStudy(study) {
      // Detach the base label only when the locked baseline itself changed
      // — toggling pin/sweep or tweaking sweep ranges still varies "around"
      // the named base, so the label and editor visibility stay put.
      set((s) => {
        const prev = s.study;
        const lockedChanged =
          prev.lockedAllocation !== study.lockedAllocation ||
          prev.lockedWithdrawal !== study.lockedWithdrawal ||
          prev.lockedSource !== study.lockedSource;
        return {
          study,
          studyDirty: true,
          baseLabel: lockedChanged ? null : s.baseLabel,
          basePickerKey: lockedChanged ? null : s.basePickerKey,
        };
      });
    },

    loadBase(base, pickerKey) {
      set((s) => ({
        study: {
          ...s.study,
          // Picking (or re-picking) a base restarts the sweep flow: all
          // three dimensions pinned, user chooses what to vary.
          varying: [],
          lockedAllocation: base.allocation,
          lockedWithdrawal: base.withdrawal,
          lockedSource: base.source,
        },
        baseLabel: base.label,
        basePickerKey: pickerKey ?? null,
        hasBase: true,
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

    async runAuto(cfg, pool) {
      const myId = ++pendingId;
      const minWithdrawalRate = get().minWithdrawalRate;
      const minSuccessRate = get().minSuccessRate;
      const ladders = buildAutoLadders({
        minWithdrawalRate,
        horizonYears: cfg.horizonYears,
      });
      // Upper bound on simulations (every rung of every ladder). Early
      // termination means the actual count is usually far lower; this is just
      // the denominator the progress bar fills toward.
      const progressTotal = ladders.reduce(
        (sum, l) => sum + autoLadderRungs(l).length,
        0,
      );
      set({ running: true, progressDone: 0, progressTotal });
      const t0 = performance.now();
      // Ladders climb withdrawal rate from the floor and stop the moment a rung
      // misses minSuccessRate (higher rates can only fail too) — so the success
      // threshold is a *run* filter, not a post-run display one. Workers return
      // only lightweight metrics for passing rungs; full trajectories are
      // re-simulated on demand for the few plans selected to overlay.
      const passers = await pool.runAutoLadders(
        ladders,
        {
          horizonYears: cfg.horizonYears,
          initialBalance: cfg.initialBalance,
          tailMethod: cfg.tailMethod,
          minSuccessRate,
        },
        (simsRun) => {
          // Ignore stale progress from a superseded run.
          if (myId === pendingId) set({ progressDone: simsRun });
        },
      );
      if (myId !== pendingId) return;
      const results: CandidateResult[] = passers.map(({ candidate, metrics }) => ({
        candidate,
        metrics,
        // result intentionally absent — filled lazily on selection.
      }));
      const frontier = filterAndFront(results, minSuccessRate);
      set({
        results,
        // No swept axis in auto mode — the scatter is metric-vs-metric and
        // curate() returns [] when axes.length !== 1, so nothing auto-overlays.
        axes: [],
        frontier,
        selectedIds: [],
        running: false,
        progressDone: progressTotal,
        studyDirty: false,
        computeMs: performance.now() - t0,
        lastConfig: cfg,
      });
    },

    async ensureResults(ids, cfg, pool) {
      const { results } = get();
      const byId = new Map(results.map((r) => [r.candidate.id, r]));
      const missing = ids
        .map((id) => byId.get(id))
        .filter((r): r is CandidateResult => !!r && !r.result);
      if (missing.length === 0) return;
      // Re-simulate just these few candidates to recover full trajectories.
      const fresh = await Promise.all(
        missing.map((r) => pool.runScenario(candidateToScenario(r.candidate, cfg))),
      );
      const filled = new Map<string, ScenarioResult>();
      missing.forEach((r, i) => filled.set(r.candidate.id, fresh[i]));
      // Merge back without disturbing identity of untouched rows. Bail if the
      // result set was replaced by a newer run while we awaited.
      const cur = get().results;
      if (cur !== results) return;
      set({
        results: cur.map((r) =>
          filled.has(r.candidate.id)
            ? { ...r, result: filled.get(r.candidate.id) }
            : r,
        ),
      });
    },

    setAutoMode(v) {
      // Engaging auto mode defaults the success filter to 100% (the user's
      // intended starting point); leaving it preserves whatever's set.
      set((s) => ({
        autoMode: v,
        minSuccessRate: v ? 1 : s.minSuccessRate,
      }));
    },

    setMinWithdrawalRate(v) {
      set({ minWithdrawalRate: Math.max(0, Math.min(1, v)), studyDirty: true });
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
        basePickerKey: null,
        hasBase: false,
        studyDirty: false,
        autoMode: false,
        minWithdrawalRate: 0.03,
        results: [],
        axes: [],
        frontier: [],
        selectedIds: [],
        minSuccessRate: 0,
        running: false,
        progressDone: 0,
        progressTotal: 0,
        computeMs: 0,
        lastConfig: null,
      });
    },
  };
});
