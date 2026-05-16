/**
 * Single source of truth for chart colors. Two palettes that should never
 * collide: asset classes (warm orange / green / gold so they don't look like
 * outcomes) and simulation outcomes (blue survived / red depleted / gray
 * in-progress).
 */

export const ASSET = {
  stock: '#6b8e7a', // sage
  bond: '#c8b896',  // wheat
  cash: '#3a5878',  // slate
};

export const OUTCOME = {
  survived: '#2a4d3a',   // forest
  depleted: '#b45a4a',   // clay
  inProgress: '#9b998e', // muted ink
  snapshot: '#3a5878',   // slate — current vs snapshot in compare mode
};
