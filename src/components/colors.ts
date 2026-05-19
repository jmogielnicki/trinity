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
};

export const OUTCOME = {
  get survived()   { return token('--color-survived'); },
  get depleted()   { return token('--color-depleted'); },
  get inProgress() { return token('--color-in-progress'); },
  get snapshot()   { return token('--color-snapshot'); },
};
