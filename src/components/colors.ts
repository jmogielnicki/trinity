/**
 * Single source of truth for chart colors. Two palettes that should never
 * collide: asset classes (warm orange / green / gold so they don't look like
 * outcomes) and simulation outcomes (blue survived / red depleted / gray
 * in-progress).
 */

export const ASSET = {
  stock: '#059669', // emerald-600
  bond: '#b08e3a',  // gold
  cash: '#7c3aed',  // violet-600
};

export const OUTCOME = {
  survived: '#2c5282',  // slate-blue
  depleted: '#d33',
  inProgress: '#888',
  snapshot: '#c44',     // current vs snapshot in compare mode
};
