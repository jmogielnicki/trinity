import { interpolateRdYlGn, interpolateYlGnBu } from 'd3-scale-chromatic';

/**
 * A 100% success rate gets its own class. Perfect cells are filled with this
 * deep emerald and ringed in gold by the heatmap — visually unmistakable
 * against the red-yellow-green ramp used for every other rate.
 */
export const PERFECT_FILL = '#0a6b3f';
export const PERFECT_RING = '#e3b341';

/** A rate is "perfect" if it rounds to 100%. */
export function isPerfect(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0.9995;
}

/**
 * Success rates cluster between ~85% and 100%, so a linear ramp wastes most
 * of its range on rates no real strategy reaches. This compresses everything
 * below 85% into the bottom quarter of the ramp and gives the 85–100% band
 * the top three quarters — the region where the interesting differences live.
 */
function successRampT(rate: number): number {
  if (rate <= 0.85) return Math.max(0, rate / 0.85) * 0.25;
  return 0.25 + Math.min(1, (rate - 0.85) / 0.15) * 0.75;
}

/** Fill color for a success-rate cell (non-perfect; perfect uses PERFECT_FILL). */
export function successColor(rate: number): string {
  if (!Number.isFinite(rate)) return '#eee';
  return interpolateRdYlGn(successRampT(rate));
}

/** Normalized 0–1 position of a success rate on the stretched ramp. */
export function successT(rate: number): number {
  return successRampT(rate);
}

/**
 * Sequential ramp for the money metrics (median final, avg withdrawal, min
 * balance). Higher is better → darker. `t` is the normalized [0,1] position.
 */
export function sequentialColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  return interpolateYlGnBu(0.12 + clamped * 0.78);
}

/** Pick readable text color for a cell given its ramp position. */
export function textColorFor(t: number): string {
  return t > 0.55 ? '#fff' : '#1a1a1a';
}
