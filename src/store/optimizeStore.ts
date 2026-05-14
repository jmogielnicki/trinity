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
  results: CandidateResult[];
  frontier: CandidateResult[];
  selectedIds: string[];
  running: boolean;
  computeMs: number;
  lastConfig: OptimizeConfig | null;
  run: (cfg: OptimizeConfig, pool: SimPool) => Promise<void>;
  toggleSelected: (id: string) => void;
  selectAllFrontier: () => void;
  clearSelection: () => void;
  reset: () => void;
};

const MAX_SELECTED = 10;

export const useOptimizeStore = create<OptimizeState>((set, get) => {
  let pendingId = 0;
  return {
    results: [],
    frontier: [],
    selectedIds: [],
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
        metrics: metricsFromResult(scenarioResults[i]),
      }));
      const frontier = paretoFront(results);
      // Pre-select the frontier (capped at MAX_SELECTED, spread across it).
      const step = Math.max(1, Math.ceil(frontier.length / MAX_SELECTED));
      const initialSelected: string[] = [];
      for (let i = 0; i < frontier.length && initialSelected.length < MAX_SELECTED; i += step) {
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
      } else if (cur.length < MAX_SELECTED) {
        set({ selectedIds: [...cur, id] });
      }
    },

    selectAllFrontier() {
      const frontier = get().frontier;
      set({
        selectedIds: frontier.slice(0, MAX_SELECTED).map((r) => r.candidate.id),
      });
    },

    clearSelection() {
      set({ selectedIds: [] });
    },

    reset() {
      pendingId++;
      set({
        results: [],
        frontier: [],
        selectedIds: [],
        running: false,
        computeMs: 0,
        lastConfig: null,
      });
    },
  };
});

export const OPTIMIZE_MAX_SELECTED = MAX_SELECTED;
