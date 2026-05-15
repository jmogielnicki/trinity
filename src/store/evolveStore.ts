import { create } from 'zustand';
import {
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
  /** Current best individual across all generations seen so far. */
  best: Individual | null;
  /** Top-N (by fitness) from the final generation. */
  topN: Individual[];
  weights: FitnessWeights;
  generations: number;
  populationSize: number;
  computeMs: number;
  lastConfig: EvolveConfig | null;
  selectedGenomeId: string | null;

  setWeights: (w: Partial<FitnessWeights>) => void;
  setGenerations: (n: number) => void;
  setPopulationSize: (n: number) => void;
  setSelected: (id: string | null) => void;
  cancel: () => void;
  run: (inputs: EvolveRunInputs, pool: SimPool) => Promise<void>;
  reset: () => void;
};

const TOP_N = 10;

export const useEvolveStore = create<EvolveStoreState>((set, get) => {
  let runId = 0;
  return {
    running: false,
    cancelRequested: false,
    history: [],
    best: null,
    topN: [],
    weights: { ...DEFAULT_WEIGHTS },
    generations: DEFAULT_CONFIG.generations,
    populationSize: DEFAULT_CONFIG.populationSize,
    computeMs: 0,
    lastConfig: null,
    selectedGenomeId: null,

    setWeights(w) {
      set({ weights: { ...get().weights, ...w } });
    },
    setGenerations(n) {
      set({ generations: Math.max(1, Math.min(200, Math.round(n))) });
    },
    setPopulationSize(n) {
      set({ populationSize: Math.max(8, Math.min(400, Math.round(n))) });
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
        weights: get().weights,
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
        best: null,
        topN: [],
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
            const prevBest = get().best;
            const newBest =
              !prevBest ||
              (snap.best.fitness ?? -Infinity) >
                (prevBest.fitness ?? -Infinity)
                ? snap.best
                : prevBest;
            const topN = snap.population.slice(0, TOP_N);
            set({
              history: [...get().history, snap],
              best: newBest,
              topN,
            });
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
        best: null,
        topN: [],
        computeMs: 0,
        lastConfig: null,
        selectedGenomeId: null,
      });
    },
  };
});

export const EVOLVE_TOP_N = TOP_N;
