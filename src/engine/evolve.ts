import type { Scenario, TailMethod } from './sweep';
import type {
  AllocationStrategy,
  WithdrawalStrategy,
} from './strategies';
import type { ScenarioResult, SimulationResult } from './types';
import { weightedQuantile, type WeightedSample } from './stats';

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
  w0: number;             // withdrawal rate at t=0,         [minWd, 0.08]
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

export const WITHDRAWAL_CEILING = 0.08;

export function defaultBounds(
  horizonYears: number,
  minWithdrawalRate: number,
): GeneBounds {
  const lo = Math.min(minWithdrawalRate, WITHDRAWAL_CEILING - 0.005);
  const wd: [number, number] = [lo, WITHDRAWAL_CEILING];
  return {
    startStock: [0.2, 1.0],
    endStock: [0.2, 1.0],
    transitionYears: [1, Math.max(2, horizonYears)],
    w0: wd,
    w1: wd,
    w2: wd,
    w3: wd,
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

/**
 * Normalized euclidean distance between two genomes in [0, 1]. Used for
 * fitness sharing — measures how genetically similar two strategies are.
 */
export function genomeDistance(
  a: Genome,
  b: Genome,
  bounds: GeneBounds,
): number {
  let sum = 0;
  for (const k of GENE_KEYS) {
    const [lo, hi] = bounds[k];
    const span = hi - lo || 1;
    const d = (a[k] - b[k]) / span;
    sum += d * d;
  }
  return Math.sqrt(sum / GENE_KEYS.length);
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
  const safetyVals: WeightedSample[] = [];
  const spendingVals: WeightedSample[] = [];
  const slopeVals: WeightedSample[] = [];
  const finals: WeightedSample[] = [];

  for (const s of result.sims as SimulationResult[]) {
    if (s.inProgress) continue;
    // Bootstrap samples carry weight 1/samplesPerPrefix so a cohort's tail
    // draws collapse to one start year; observed cohorts default to 1.
    const weight = s.weight ?? 1;
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
      safetyVals.push({ value: 0, weight });
      finals.push({ value: 0, weight });
    } else {
      safetyVals.push({ value: Math.max(0, minBal) / initialBalance, weight });
      finals.push({
        value:
          typeof s.finalBalance === 'number'
            ? s.finalBalance
            : s.trajectory[N - 1]?.balance ?? 0,
        weight,
      });
    }
    spendingVals.push({ value: totalWd / initialBalance, weight });
    slopeVals.push({ value: earlyWd > 0 ? lateWd / earlyWd : 1, weight });
  }

  return {
    // In bootstrap mode the projected rate already equal-weights cohorts;
    // fall back to the observed rate when no bootstrap tails were used.
    successRate: result.projectedSuccessRate ?? result.successRate,
    safetyP5: safetyVals.length ? weightedQuantile(safetyVals, 0.05) : 0,
    spendingMedian: spendingVals.length
      ? weightedQuantile(spendingVals, 0.5)
      : 0,
    slopeMedian: slopeVals.length ? weightedQuantile(slopeVals, 0.5) : 1,
    p5Final: finals.length ? weightedQuantile(finals, 0.05) : NaN,
    p50Final: finals.length ? weightedQuantile(finals, 0.5) : NaN,
    p95Final: finals.length ? weightedQuantile(finals, 0.95) : NaN,
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
// Islands
// ---------------------------------------------------------------------------

/**
 * An island is a sub-population evolving under its own fitness weighting.
 * Running several islands in parallel and never (or rarely) migrating between
 * them is what produces *distinct* optima — each island answers a different
 * definition of "best".
 */
export type IslandProfile = {
  id: string;
  name: string;
  blurb: string;
  weights: FitnessWeights;
};

/**
 * Build the standard set of island profiles. "Balanced" uses the user's own
 * weight sliders; the others are fixed goal-specialists. The success floor is
 * shared across all islands so the user's floor slider applies everywhere.
 */
export function buildProfiles(userWeights: FitnessWeights): IslandProfile[] {
  const floor = userWeights.successFloor;
  return [
    {
      id: 'balanced',
      name: 'Balanced',
      blurb: 'Your weight sliders',
      weights: userWeights,
    },
    {
      id: 'safety',
      name: 'Safety-first',
      blurb: 'Maximize the cushion above zero',
      weights: { successFloor: floor, safety: 0.85, spending: 0.15, slope: 0 },
    },
    {
      id: 'spending',
      name: 'Spend-it-down',
      blurb: 'Maximize lifetime spending',
      weights: { successFloor: floor, safety: 0.1, spending: 0.9, slope: 0.05 },
    },
    {
      id: 'rampup',
      name: 'Ramp-up',
      blurb: 'Spend more in later years',
      weights: { successFloor: floor, safety: 0.2, spending: 0.45, slope: 0.4 },
    },
  ];
}

// ---------------------------------------------------------------------------
// Genetic algorithm
// ---------------------------------------------------------------------------

export type EvolveConfig = {
  initialBalance: number;
  horizonYears: number;
  tailMethod?: TailMethod;
  /** Population size *per island*. */
  populationSize: number;
  generations: number;
  tournamentSize: number;
  crossoverRate: number;
  mutationRate: number;
  /** Stddev of gaussian mutation as a fraction of each gene's range. */
  mutationSigma: number;
  elitism: number;
  /** Lower bound for all withdrawal genes — the feasible minimum SWR. */
  minWithdrawalRate: number;
  /**
   * Fitness-sharing radius (normalized genome distance). Individuals within
   * this radius of each other have their selection fitness divided down,
   * pushing each island's population to spread out. 0 disables sharing.
   */
  sharingRadius: number;
  profiles: IslandProfile[];
  seed: number;
};

export const DEFAULT_CONFIG: Omit<
  EvolveConfig,
  'initialBalance' | 'horizonYears' | 'tailMethod' | 'profiles'
> = {
  populationSize: 40,
  generations: 20,
  tournamentSize: 3,
  crossoverRate: 0.7,
  mutationRate: 0.15,
  mutationSigma: 0.1,
  elitism: 3,
  minWithdrawalRate: 0.0325,
  sharingRadius: 0.15,
  seed: 1,
};

export type Individual = {
  genome: Genome;
  metrics?: EvolveMetrics;
  /** Raw scalar fitness under the island's weights. */
  fitness?: number;
  /** Fitness after niche penalty — used for selection, not for ranking. */
  sharedFitness?: number;
};

export type IslandState = {
  profile: IslandProfile;
  /** Population sorted by raw fitness, descending. */
  population: Individual[];
  best: Individual;
  bestFitness: number;
  medianFitness: number;
};

export type GenerationSnapshot = {
  generation: number;
  islands: IslandState[];
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
  const score = (i: Individual) => i.sharedFitness ?? i.fitness ?? -Infinity;
  let best = pop[Math.floor(rng() * pop.length)];
  for (let i = 1; i < k; i++) {
    const c = pop[Math.floor(rng() * pop.length)];
    if (score(c) > score(best)) best = c;
  }
  return best;
}

/**
 * Triangular fitness sharing. Each individual's selection fitness is divided
 * by its niche count — the sum of (1 - d/radius) over neighbors within
 * `radius`. Clustered individuals get penalized; loners keep full fitness.
 */
function applySharing(
  pop: Individual[],
  bounds: GeneBounds,
  radius: number,
): void {
  if (radius <= 0) {
    for (const ind of pop) ind.sharedFitness = ind.fitness;
    return;
  }
  for (let i = 0; i < pop.length; i++) {
    let niche = 0;
    for (let j = 0; j < pop.length; j++) {
      const d = genomeDistance(pop[i].genome, pop[j].genome, bounds);
      if (d < radius) niche += 1 - d / radius;
    }
    const f = pop[i].fitness ?? 0;
    pop[i].sharedFitness = niche > 0 ? f / niche : f;
  }
}

export type EvalFn = (genomes: Genome[]) => Promise<ScenarioResult[]>;

/**
 * Run the island-model GA. `evaluate` is injected so this module stays
 * UI-free — the store wires it to the worker pool. All islands' newcomers are
 * evaluated in one batched call per generation for worker-pool efficiency;
 * fitness is then applied per-island with that island's weights.
 *
 * `onGeneration` fires after each generation is scored, so the UI can draw a
 * live per-island convergence chart.
 */
export async function evolve(
  cfg: EvolveConfig,
  evaluate: EvalFn,
  onGeneration?: (snap: GenerationSnapshot) => void,
  shouldCancel?: () => boolean,
): Promise<GenerationSnapshot[]> {
  const bounds = defaultBounds(cfg.horizonYears, cfg.minWithdrawalRate);
  const rng = makeRng(cfg.seed);

  // Seed every island with its own random population.
  let pops: Individual[][] = cfg.profiles.map(() =>
    Array.from({ length: cfg.populationSize }, () => ({
      genome: randomGenome(rng, bounds),
    })),
  );

  await scoreAcrossIslands(pops, cfg, bounds, evaluate);
  const history: GenerationSnapshot[] = [];
  history.push(snapshotOf(0, cfg.profiles, pops));
  onGeneration?.(history[0]);

  for (let gen = 1; gen <= cfg.generations; gen++) {
    if (shouldCancel?.()) break;

    // Breed each island independently.
    const nextPops: Individual[][] = pops.map((pop) => {
      const sorted = [...pop].sort(
        (a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity),
      );
      const elites = sorted.slice(0, cfg.elitism).map((i) => ({ ...i }));
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
        childG = mutate(
          childG, rng, bounds, cfg.mutationRate, cfg.mutationSigma,
        );
        next.push({ genome: childG });
      }
      return next;
    });

    await scoreAcrossIslands(nextPops, cfg, bounds, evaluate);
    pops = nextPops;

    const snap = snapshotOf(gen, cfg.profiles, pops);
    history.push(snap);
    onGeneration?.(snap);
  }
  return history;
}

/**
 * Score every not-yet-evaluated individual across all islands in a single
 * batched `evaluate` call, then apply each island's weights + fitness sharing.
 */
async function scoreAcrossIslands(
  pops: Individual[][],
  cfg: EvolveConfig,
  bounds: GeneBounds,
  evaluate: EvalFn,
): Promise<void> {
  const pending: Individual[] = [];
  for (const pop of pops) {
    for (const ind of pop) {
      if (ind.metrics === undefined) pending.push(ind);
    }
  }
  if (pending.length > 0) {
    const results = await evaluate(pending.map((p) => p.genome));
    for (let i = 0; i < pending.length; i++) {
      pending[i].metrics = metricsFromResult(results[i], cfg.initialBalance);
    }
  }
  // Apply per-island weights and fitness sharing.
  for (let isl = 0; isl < pops.length; isl++) {
    const w = cfg.profiles[isl].weights;
    for (const ind of pops[isl]) {
      ind.fitness = fitnessOf(ind.metrics!, w);
    }
    applySharing(pops[isl], bounds, cfg.sharingRadius);
  }
}

function snapshotOf(
  generation: number,
  profiles: IslandProfile[],
  pops: Individual[][],
): GenerationSnapshot {
  const islands: IslandState[] = pops.map((pop, i) => {
    const sorted = [...pop].sort(
      (a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity),
    );
    const best = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      profile: profiles[i],
      population: sorted,
      best,
      bestFitness: best.fitness ?? 0,
      medianFitness: median.fitness ?? 0,
    };
  });
  return { generation, islands };
}
