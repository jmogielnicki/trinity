// 2D Pareto frontier (skyline) over an arbitrary point set.
//
// Returns the ids of the non-dominated points: the upper-right edge running from
// the best-x point to the best-y point, with the trade-off points in between. A
// point is dominated if another point is at least as good on both axes and
// strictly better on one. O(n log n) — sort by x descending, then keep any point
// whose y beats the best y seen so far.

export function paretoSkyline<T>(
  items: T[],
  getX: (t: T) => number,
  getY: (t: T) => number,
  getId: (t: T) => string,
  xHigherBetter: boolean,
  yHigherBetter: boolean,
): Set<string> {
  const xSign = xHigherBetter ? 1 : -1;
  const ySign = yHigherBetter ? 1 : -1;
  const pts = items
    .map((t) => ({ id: getId(t), x: xSign * getX(t), y: ySign * getY(t) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  // x desc, ties broken by y desc so the best point in an x-tie comes first.
  pts.sort((a, b) => b.x - a.x || b.y - a.y);
  const front = new Set<string>();
  let bestY = -Infinity;
  for (const p of pts) {
    if (p.y > bestY) {
      front.add(p.id);
      bestY = p.y;
    }
  }
  return front;
}
