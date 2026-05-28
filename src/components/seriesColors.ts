// Categorical palette for per-series colors in the multi-strategy overlay
// charts (compare view and the optimize-study overlay). A series' color is
// assigned by its position in the list and reused across the cards, every
// chart, and the table so the eye can track one strategy everywhere.
export const SERIES_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f',
];

export function colorAt(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

/** Same color with an alpha suffix (8-digit hex), for translucent fills. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
