import type { Scenario, TailMethod } from './sweep';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from './strategies';
import type { ScenarioResult, SimulationResult } from './types';
import { quantile } from './stats';

// ---------------------------------------------------------------------------
// Genome
// ---------------------------------------------------------------------------

/**
 * 7-gene continuous genome. Allocation is a glide path; withdrawal is a
 * 4-point piecewise-linear curve evaluated evenly across the horizon. Together
 * this covers static + classic-glide + rising-equity allocations and any
 * monotonic or non-monotonic withdrawal shape — including the "ratchet up
 * spending over time" pattern the user wants the GA to discover.
 */
export type Genome = {
  startStock: number;     // [0.2, 1.0]
  endStock: number;       // [0.2, 1.0]
  transitionYears: number; // [1, horizon]
  w0: number;             // withdrawal rate at t=0,         [0.02, 0.08]
  w1: number;             // withdrawal rate at t=horizon/3
  w2: number;             // withdrawal rate at t=2*horizon/3
  w3: number;             // withdrawal rate at t=horizon
};

export type GeneBounds = {
  startStock: [number, number];
  endStock: [number, number];
  transitionYears: [number, number];
  w0: [number, number];
  w1: [number, number];
  w2: [number, number];
  w3: [number, number];
};

export function defaultBounds(horizonYears: number): GeneBounds {
  return {
    startStock: [0.2, 1.0],
    endStock: [0.2, 1.0],
    transitionYears: [1, Math.max(2, horizonYears)],
    w0: [0.02, 0.08],
    w1: [0.02, 0.08],
    w2: [0.02, 0.08],
    w3: [0.02, 0.08],
  };
}

export const GENE_KEYS: (keyof Genome)[] = [
  'startStock', 'endStock', 'transitionYears', 'w0', 'w1', 'w2', 'w3',
];

// ---------------------------------------------------------------------------
// Genome -> Scenario
// ---------------------------------------------------------------------------

export function genomeToAllocation(g: Genome): AllocationStrategy {
  return {
    type: 'glidepath',
    start: { stock: g.startStock, bond: 1 - g.startStock, cash: 0 },
    end: { stock: g.endStock, bond: 1 - g.endStock, cash: 0 },
    transitionYears: Math.max(1, Math.round(g.transitionYears)),
  };
}

export function genomeToWithdrawal(
  g: Genome,
  horizonYears: number,
): WithdrawalStrategy {
  const h = Math.max(1, horizonYears - 1);
  return {
    type: 'piecewiseLinear',
    points: [
      { t: 0,            rate: g.w0 },
      { t: h / 3,        rate: g.w1 },
      { t: (2 * h) / 3,  rate: g.w2 },
      { t: h,            rate: g.w3 },
    ],
  };
}

export function genomeToScenario(g: Genome, cfg: EvolveConfig): Scenario {
  return {
    initialBalance: cfg.initialBalance,
    horizonYears: cfg.horizonYears,
    allocation: genomeToAllocation(g),
    withdrawal: genomeToWithdrawal(g, cfg.horizonYears),
    tailMethod: cfg.tailMethod ?? { type: 'truncate' },
  };
}

export function genomeId(g: Genome): string {
  return [
    g.startStock, g.endStock, g.transitionYears,
    g.w0, g.w1, g.w2, g.w3,
  ].map((v) => v.toFixed(4)).join('|');
}

export function genomeLabel(g: Genome): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const wpct = (x: number) => `${(x * 100).toFixed(2)}%`;
  return (
    `glide ${pct(g.startStock)}→${pct(g.endStock)} stk / ` +
    `${Math.round(g.transitionYears)}y · ` +
    `wd ${wpct(g.w0)}→${wpct(g.w1)}→${wpct(g.w2)}→${wpct(g.w3)}`
  );
}

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------

/**
 * Per-strategy metrics aggregated across the historical sweep. Everything is
 * normalized to be unit-free / comparable across horizons so the GA's scalar
 * fitness behaves sanely as the user changes weight sliders.
 */
export type EvolveMetrics = {
  successRate: number;
  /** p5 across sims of (min real balance across horizon) / initial. */
  safetyP5: number;
  /** Median across completed sims of total real withdrawals / initial. */
  spendingMedian: number;
  /** Median across completed sims of (sum last third) / (sum first third). */
  slopeMedian: number;
  /** Final balance percentiles (for the scatter / display). */
  p5Final: number;
  p50Final: number;
  p95Final: number;
  worstStartYear?: number;
  completedCount: number;
};

export type FitnessWeights = {
  /** Strategies under this success rate get a hard penalty. */
  successFloor: number;
  safety: number;
  spending: number;
  /** How much to reward upward spending (later > earlier). */
  slope: number;
};

export const DEFAULT_WEIGHTS: FitnessWeights = {
  successFloor: 0.95,
  safety: 0.4,
  spending: 0.6,
  slope: 0.1,
};

export function metricsFromResult(
  result: ScenarioResult,
  initialBalance: number,
): EvolveMetrics {
  const safetyVals: number[] = [];
  const spendingVals: number[] = [];
  const slopeVals: number[] = [];
  const finals: number[] = [];

  for (const s of result.sims as SimulationResult[]) {
    if (s.inProgress) continue;
    let minBal = Infinity;
    let totalWd = 0;
    let earlyWd = 0;
    let lateWd = 0;
    const N = s.trajectory.length;
    const third = Math.max(1, Math.floor(N / 3));
    for (let i = 0; i < N; i++) {
      const r = s.trajectory[i];
      if (r.balance < minBal) minBal = r.balance;
      totalWd += r.withdrawal;
      if (i < third) earlyWd += r.withdrawal;
      if (i >= N - third) lateWd += r.withdrawal;
    }
    if (!s.success) {
      // Depleted runs: clamp safety to 0, count actual withdrawals taken.
      safetyVals.push(0);
      finals.push(0);
    } else {
      safetyVals.push(Math.max(0, minBal) / initialBalance);
      finals.push(
        typeof s.finalBalance === 'number'
          ? s.finalBalance
          : s.trajectory[N - 1]?.balance ?? 0,
      );
    }
    spendingVals.push(totalWd / initialBalance);
    slopeVals.push(earlyWd > 0 ? lateWd / earlyWd : 1);
  }

  safetyVals.sort((a, b) => a - b);
  spendingVals.sort((a, b) => a - b);
  slopeVals.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);

  return {
    successRate: result.successRate,
    safetyP5: safetyVals.length ? quantile(safetyVals, 0.05) : 0,
    spendingMedian: spendingVals.length ? quantile(spendingVals, 0.5) : 0,
    slopeMedian: slopeVals.length ? quantile(slopeVals, 0.5) : 1,
    p5Final: finals.length ? quantile(finals, 0.05) : NaN,
    p50Final: finals.length ? quantile(finals, 0.5) : NaN,
    p95Final: finals.length ? quantile(finals, 0.95) : NaN,
    worstStartYear: result.worstStartYear,
    completedCount: result.completedCount,
  };
}

/**
 * Scalar fitness combining survival (hard gate), safety, spending, slope.
 * All terms are designed to live roughly in [0, 1] so weight sliders behave
 * intuitively.
 */
export function fitnessOf(m: EvolveMetrics, w: FitnessWeights): number {
  // Hard gate: smoothly collapse below the floor.
  let gate = 1;
  if (m.successRate < w.successFloor) {
    const gap = w.successFloor - m.successRate;
    gate = Math.max(0, 1 - gap * 10); // 10pp below floor → 0
  }
  // Spending: a scenario that withdraws horizon * 4% pulls spendingMedian
  // around horizon*0.04. Normalize by horizon*0.04 so 1.0 == "would spend
  // exactly the 4% rule baseline". Cap at 2x to avoid runaway.
  const spendingTerm = Math.min(2, m.spendingMedian / 1.0); // typical 0.6–1.6
  const safetyTerm = Math.min(1, m.safetyP5);
  // Slope > 1 means later spending exceeds earlier; bonus on log scale, capped.
  const slopeTerm = Math.max(0, Math.min(1, Math.log2(Math.max(0.25, m.slopeMedian))));
  const raw =
    w.safety * safetyTerm + w.spending * spendingTerm + w.slope * slopeTerm;
  return gate * raw;
}

// ---------------------------------------------------------------------------
// Genetic algorithm
// ---------------------------------------------------------------------------

export type EvolveConfig = {
  initialBalance: number;
  horizonYears: number;
  tailMethod?: TailMethod;
  populationSize: number;
  generations: number;
  tournamentSize: number;
  crossoverRate: number;
  mutationRate: number;
  /** Stddev of gaussian mutation as a fraction of each gene's range. */
  mutationSigma: number;
  elitism: number;
  weights: FitnessWeights;
  seed: number;
};

export const DEFAULT_CONFIG: Omit<
  EvolveConfig,
  'initialBalance' | 'horizonYears' | 'tailMethod'
> = {
  populationSize: 60,
  generations: 25,
  tournamentSize: 3,
  crossoverRate: 0.7,
  mutationRate: 0.15,
  mutationSigma: 0.1,
  elitism: 4,
  weights: DEFAULT_WEIGHTS,
  seed: 1,
};

export type Individual = {
  genome: Genome;
  metrics?: EvolveMetrics;
  fitness?: number;
};

export type GenerationSnapshot = {
  generation: number;
  best: Individual;
  median: Individual;
  bestFitness: number;
  medianFitness: number;
  population: Individual[];
};

// Mulberry32 — small, seedable, deterministic.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, [lo, hi]: [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}

function randomGenome(rng: () => number, b: GeneBounds): Genome {
  const r = (range: [number, number]) =>
    range[0] + rng() * (range[1] - range[0]);
  return {
    startStock: r(b.startStock),
    endStock: r(b.endStock),
    transitionYears: r(b.transitionYears),
    w0: r(b.w0),
    w1: r(b.w1),
    w2: r(b.w2),
    w3: r(b.w3),
  };
}

function gaussian(rng: () => number): number {
  // Box–Muller.
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mutate(
  g: Genome,
  rng: () => number,
  b: GeneBounds,
  rate: number,
  sigma: number,
): Genome {
  const out: Genome = { ...g };
  for (const k of GENE_KEYS) {
    if (rng() < rate) {
      const range = b[k];
      const span = range[1] - range[0];
      out[k] = clamp(g[k] + gaussian(rng) * sigma * span, range);
    }
  }
  return out;
}

function crossover(a: Genome, c: Genome, rng: () => number): Genome {
  const out = {} as Genome;
  for (const k of GENE_KEYS) {
    out[k] = rng() < 0.5 ? a[k] : c[k];
  }
  return out;
}

function tournament(
  pop: Individual[],
  k: number,
  rng: () => number,
): Individual {
  let best = pop[Math.floor(rng() * pop.length)];
  for (let i = 1; i < k; i++) {
    const c = pop[Math.floor(rng() * pop.length)];
    if ((c.fitness ?? -Infinity) > (best.fitness ?? -Infinity)) best = c;
  }
  return best;
}

export type EvalFn = (genomes: Genome[]) => Promise<ScenarioResult[]>;

/**
 * Run the GA. `evaluate` is injected so this module stays UI-free —
 * the store wires it to the worker pool.
 *
 * Calls `onGeneration` after each generation finishes scoring; lets the UI
 * update a live convergence chart.
 */
export async function evolve(
  cfg: EvolveConfig,
  evaluate: EvalFn,
  onGeneration?: (snap: GenerationSnapshot) => void,
  shouldCancel?: () => boolean,
): Promise<GenerationSnapshot[]> {
  const bounds = defaultBounds(cfg.horizonYears);
  const rng = makeRng(cfg.seed);
  let pop: Individual[] = Array.from({ length: cfg.populationSize }, () => ({
    genome: randomGenome(rng, bounds),
  }));

  await scorePopulation(pop, cfg, evaluate);
  const history: GenerationSnapshot[] = [];
  history.push(snapshotOf(0, pop));
  onGeneration?.(history[0]);

  for (let gen = 1; gen <= cfg.generations; gen++) {
    if (shouldCancel?.()) break;

    pop.sort(
      (a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity),
    );
    const elites = pop.slice(0, cfg.elitism).map((i) => ({ ...i }));
    const next: Individual[] = [...elites];

    while (next.length < cfg.populationSize) {
      const p1 = tournament(pop, cfg.tournamentSize, rng);
      let childG: Genome;
      if (rng() < cfg.crossoverRate) {
        const p2 = tournament(pop, cfg.tournamentSize, rng);
        childG = crossover(p1.genome, p2.genome, rng);
      } else {
        childG = { ...p1.genome };
      }
      childG = mutate(childG, rng, bounds, cfg.mutationRate, cfg.mutationSigma);
      next.push({ genome: childG });
    }

    // Score only the new (non-elite) individuals.
    const newcomers = next.slice(cfg.elitism);
    await scorePopulation(newcomers, cfg, evaluate);
    pop = next;

    const snap = snapshotOf(gen, pop);
    history.push(snap);
    onGeneration?.(snap);
  }
  return history;
}

async function scorePopulation(
  pop: Individual[],
  cfg: EvolveConfig,
  evaluate: EvalFn,
): Promise<void> {
  const need = pop.filter((p) => p.metrics === undefined);
  if (need.length === 0) return;
  const results = await evaluate(need.map((p) => p.genome));
  for (let i = 0; i < need.length; i++) {
    need[i].metrics = metricsFromResult(results[i], cfg.initialBalance);
    need[i].fitness = fitnessOf(need[i].metrics!, cfg.weights);
  }
}

function snapshotOf(generation: number, pop: Individual[]): GenerationSnapshot {
  const sorted = [...pop].sort(
    (a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity),
  );
  const best = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    generation,
    best,
    median,
    bestFitness: best.fitness ?? 0,
    medianFitness: median.fitness ?? 0,
    population: sorted,
  };
}
