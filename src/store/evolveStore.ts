import { create } from 'zustand';
import {
  buildProfiles,
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  evolve,
  genomeToScenario,
  type EvolveConfig,
  type FitnessWeights,
  type GenerationSnapshot,
  type Genome,
  type Individual,
} from '../engine/evolve';
import type { TailMethod } from '../engine/sweep';
import type { SimPool } from '../worker/pool';

export type EvolveRunInputs = {
  initialBalance: number;
  horizonYears: number;
  tailMethod?: TailMethod;
};

export type EvolveStoreState = {
  running: boolean;
  cancelRequested: boolean;
  history: GenerationSnapshot[];
  computeMs: number;
  lastConfig: EvolveConfig | null;
  weights: FitnessWeights;
  minWithdrawalRate: number;
  generations: number;
  populationSize: number;
  selectedGenomeId: string | null;

  setWeights: (w: Partial<FitnessWeights>) => void;
  setMinWithdrawalRate: (r: number) => void;
  setGenerations: (n: number) => void;
  setPopulationSize: (n: number) => void;
  setSelected: (id: string | null) => void;
  cancel: () => void;
  run: (inputs: EvolveRunInputs, pool: SimPool) => Promise<void>;
  reset: () => void;
};

export const useEvolveStore = create<EvolveStoreState>((set, get) => {
  let runId = 0;
  return {
    running: false,
    cancelRequested: false,
    history: [],
    computeMs: 0,
    lastConfig: null,
    weights: { ...DEFAULT_WEIGHTS },
    minWithdrawalRate: DEFAULT_CONFIG.minWithdrawalRate,
    generations: DEFAULT_CONFIG.generations,
    populationSize: DEFAULT_CONFIG.populationSize,
    selectedGenomeId: null,

    setWeights(w) {
      set({ weights: { ...get().weights, ...w } });
    },
    setMinWithdrawalRate(r) {
      set({ minWithdrawalRate: Math.max(0.02, Math.min(0.05, r)) });
    },
    setGenerations(n) {
      set({ generations: Math.max(5, Math.min(80, Math.round(n))) });
    },
    setPopulationSize(n) {
      set({ populationSize: Math.max(20, Math.min(200, Math.round(n))) });
    },
    setSelected(id) {
      set({ selectedGenomeId: id });
    },
    cancel() {
      set({ cancelRequested: true });
    },

    async run(inputs, pool) {
      const myId = ++runId;
      const cfg: EvolveConfig = {
        ...DEFAULT_CONFIG,
        profiles: buildProfiles(get().weights),
        minWithdrawalRate: get().minWithdrawalRate,
        generations: get().generations,
        populationSize: get().populationSize,
        initialBalance: inputs.initialBalance,
        horizonYears: inputs.horizonYears,
        tailMethod: inputs.tailMethod,
      };

      set({
        running: true,
        cancelRequested: false,
        history: [],
        lastConfig: cfg,
        selectedGenomeId: null,
      });
      const t0 = performance.now();

      const evaluate = async (genomes: Genome[]) => {
        const scenarios = genomes.map((g) => genomeToScenario(g, cfg));
        return pool.runMany(scenarios);
      };

      try {
        await evolve(
          cfg,
          evaluate,
          (snap) => {
            if (myId !== runId) return;
            set({ history: [...get().history, snap] });
          },
          () => myId !== runId || get().cancelRequested,
        );
      } finally {
        if (myId === runId) {
          set({
            running: false,
            cancelRequested: false,
            computeMs: performance.now() - t0,
          });
        }
      }
    },

    reset() {
      runId++;
      set({
        running: false,
        cancelRequested: false,
        history: [],
        computeMs: 0,
        lastConfig: null,
        selectedGenomeId: null,
      });
    },
  };
});

/** Champions = the best individual from each island in the latest snapshot. */
export function latestChampions(
  history: GenerationSnapshot[],
): Array<{ islandId: string; islandName: string; individual: Individual }> {
  if (history.length === 0) return [];
  const snap = history[history.length - 1];
  return snap.islands.map((isl) => ({
    islandId: isl.profile.id,
    islandName: isl.profile.name,
    individual: isl.best,
  }));
}
