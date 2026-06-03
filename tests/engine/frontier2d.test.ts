import { describe, it, expect } from 'vitest';
import { paretoSkyline } from '../../src/components/optimize/frontier2d';

type P = { id: string; x: number; y: number };
const sky = (pts: P[], xUp = true, yUp = true) =>
  paretoSkyline(pts, (p) => p.x, (p) => p.y, (p) => p.id, xUp, yUp);

describe('paretoSkyline (2D frontier)', () => {
  it('keeps the upper-right edge and drops dominated interior points', () => {
    const pts: P[] = [
      { id: 'maxX', x: 10, y: 1 }, // safest (max x)
      { id: 'maxY', x: 1, y: 10 }, // richest (max y)
      { id: 'mid', x: 6, y: 6 }, // genuine trade-off — on the frontier
      { id: 'dom', x: 5, y: 5 }, // dominated by mid (worse on both)
      { id: 'bl', x: 0, y: 0 }, // bottom-left — dominated by everything
    ];
    const front = sky(pts);
    expect(front).toEqual(new Set(['maxX', 'maxY', 'mid']));
    expect(front.has('dom')).toBe(false);
    expect(front.has('bl')).toBe(false);
  });

  it('always includes the best-x and best-y points', () => {
    const pts: P[] = Array.from({ length: 500 }, (_, i) => ({
      id: `p${i}`,
      x: Math.sin(i) * 100 + 100,
      y: Math.cos(i * 1.3) * 100 + 100,
    }));
    const front = sky(pts);
    const maxX = pts.reduce((a, b) => (b.x > a.x ? b : a));
    const maxY = pts.reduce((a, b) => (b.y > a.y ? b : a));
    expect(front.has(maxX.id)).toBe(true);
    expect(front.has(maxY.id)).toBe(true);
  });

  it('the frontier is internally non-dominated', () => {
    const pts: P[] = Array.from({ length: 800 }, (_, i) => ({
      id: `p${i}`,
      x: (i * 2654435761) % 1000,
      y: (i * 40503) % 1000,
    }));
    const front = sky(pts);
    const fp = pts.filter((p) => front.has(p.id));
    for (const a of fp) {
      for (const b of fp) {
        if (a.id === b.id) continue;
        // No frontier point may dominate another (≥ on both, > on one).
        const dominates = b.x >= a.x && b.y >= a.y && (b.x > a.x || b.y > a.y);
        expect(dominates).toBe(false);
      }
    }
  });

  it('respects axis direction (lower-is-better)', () => {
    const pts: P[] = [
      { id: 'lowX', x: 0, y: 5 },
      { id: 'lowY', x: 5, y: 0 },
      { id: 'hi', x: 9, y: 9 }, // worst on both when lower is better → dropped
    ];
    // Both axes lower-is-better → frontier is the lower-left edge.
    const front = sky(pts, false, false);
    expect(front.has('hi')).toBe(false);
    expect(front.has('lowX')).toBe(true);
    expect(front.has('lowY')).toBe(true);
  });
});
