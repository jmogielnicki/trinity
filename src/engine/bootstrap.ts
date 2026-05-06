import type { AnnualReturns } from './types';

/**
 * Stationary block bootstrap (Politis & Romano 1994). Geometric block lengths
 * with mean = blockYears make the resulting series stationary, which matters
 * for clean statistics — fixed block lengths bias variance estimates.
 */
export function bootstrapTail(
  prefixLength: number,
  totalLength: number,
  data: AnnualReturns[],
  blockYears: number,
  rng: () => number,
): AnnualReturns[] {
  const need = totalLength - prefixLength;
  const tail: AnnualReturns[] = [];
  while (tail.length < need) {
    const blockStart = Math.floor(rng() * data.length);
    // Geometric length: ceil(-mean * log(U))
    const blockLen = Math.max(1, Math.ceil(-blockYears * Math.log(rng())));
    for (let i = 0; i < blockLen && tail.length < need; i++) {
      tail.push(data[(blockStart + i) % data.length]);
    }
  }
  return tail;
}

/**
 * Mulberry32 — small, fast seedable RNG. We don't need crypto; we need
 * reproducibility so URL-shared scenarios produce identical simulations.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable string hash → 32-bit seed. Used as default seed when scenario
 * doesn't provide one.
 */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
