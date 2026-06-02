// Position-weighted downsampling for the optimize scatter plot.
//
// Rendering the full result set (tens of thousands of points) makes the scatter
// lag. We thin only what's safe to thin: pinned points (the frontier, and any
// active-filter matches) are always kept; the rest are sampled with a weight
// that grows toward the top-right, so the dense, uninteresting bottom-left bulk
// drops out while the frontier neighborhood stays dense. Thinning is purely
// visual — selection still runs over the full result set.

/** ~max non-pinned points drawn. */
export const SCATTER_RENDER_BUDGET = 4000;
/** Below this many points there's no lag, so draw everything. */
export const SCATTER_THIN_THRESHOLD = 3000;
/** Higher → the bottom-left bulk thins harder relative to the frontier. */
export const SCATTER_THIN_GAMMA = 2.5;
/** Keeps a faint wash of the bottom-left bulk rather than clearing it entirely. */
export const SCATTER_THIN_FLOOR = 0.02;

// Deterministic [0,1) hash of an id, so a point's keep/drop is stable across
// re-renders (no flicker) and independent of its keep weight.
export function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function downsampleForRender<T>(
  items: T[],
  getX: (t: T) => number,
  getY: (t: T) => number,
  getId: (t: T) => string,
  pinned: (t: T) => boolean,
): T[] {
  if (items.length <= SCATTER_THIN_THRESHOLD) return items;

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const t of items) {
    const vx = getX(t), vy = getY(t);
    if (vx < xMin) xMin = vx;
    if (vx > xMax) xMax = vx;
    if (vy < yMin) yMin = vy;
    if (vy > yMax) yMax = vy;
  }
  const xr = xMax - xMin || 1;
  const yr = yMax - yMin || 1;

  // Relative keep weight ∈ (0,~1]: ~0 at the bottom-left corner, ~1 toward the
  // top-right (the frontier). The floor keeps a sparse scatter everywhere.
  const weight = (t: T) => {
    const nx = (getX(t) - xMin) / xr;
    const ny = (getY(t) - yMin) / yr;
    const s = (nx + ny) / 2;
    return SCATTER_THIN_FLOOR + Math.pow(s, SCATTER_THIN_GAMMA);
  };

  const pinnedList = items.filter(pinned);
  const thinnable = items.filter((t) => !pinned(t));

  // Scale weights so the expected kept count meets the budget (never inflates).
  let total = 0;
  for (const t of thinnable) total += weight(t);
  const scale = total > 0 ? Math.min(1, SCATTER_RENDER_BUDGET / total) : 1;

  const sampled = thinnable.filter((t) => hash01(getId(t)) < weight(t) * scale);
  // Pinned drawn last → frontier/matched render on top of the thinned field.
  return [...sampled, ...pinnedList];
}
