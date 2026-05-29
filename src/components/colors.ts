/**
 * Chart color palettes derived from the CSS design tokens defined in
 * src/index.css (@theme block). Reading via getComputedStyle ensures these
 * stay in sync with the tokens automatically — no manual duplication.
 *
 * Two palettes that should never collide: asset classes (warm colors so they
 * don't look like outcomes) and simulation outcomes (blue/red/gray).
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const ASSET = {
  get stock() { return token('--color-stock'); },
  get bond()  { return token('--color-bond'); },
  get cash()  { return token('--color-cash'); },
  get cashWash()  { return token('--color-cash-wash'); },
};

export const OUTCOME = {
  get survived()   { return token('--color-survived'); },
  get depleted()   { return token('--color-depleted'); },
  get inProgress() { return token('--color-in-progress'); },
  get snapshot()   { return token('--color-snapshot'); },
};

/**
 * Chart chrome — axis/grid/label/handle colors shared by the D3 (StartYearChart,
 * WithdrawalCurve, OutcomeStrip, StackedBar) and Highcharts views. Centralizes
 * the greys/accents that used to be scattered hex literals so they track the
 * theme. `surface` is the chart background (paper white).
 */
export const CHART = {
  get ink()         { return token('--color-chart-ink'); },
  get label()       { return token('--color-chart-label'); },
  get muted()       { return token('--color-chart-muted'); },
  get faint()       { return token('--color-chart-faint'); },
  get grid()        { return token('--color-chart-grid'); },
  get hairline()    { return token('--color-chart-hairline'); },
  get accent()      { return token('--color-chart-accent'); },
  get accentLight() { return token('--color-chart-accent-light'); },
  get shade()       { return token('--color-chart-shade'); },
  get surface()     { return token('--color-surface'); },
};
