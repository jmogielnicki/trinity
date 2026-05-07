/**
 * Single source of truth for chart colors. Two palettes that should never
 * collide: asset classes (warm orange / green / gold so they don't look like
 * outcomes) and simulation outcomes (blue survived / red depleted / gray
 * in-progress).
 */

export const ASSET = {
  stock: '#d97706', // amber-600
  bond: '#059669',  // emerald-600
  cash: '#b08e3a',  // gold
};

export const OUTCOME = {
  survived: '#2c5282',  // slate-blue
  depleted: '#d33',
  inProgress: '#888',
  snapshot: '#c44',     // current vs snapshot in compare mode
};
