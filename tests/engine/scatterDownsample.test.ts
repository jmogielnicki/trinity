import { describe, it, expect } from 'vitest';
import {
  downsampleForRender,
  hash01,
  SCATTER_RENDER_BUDGET,
  SCATTER_THIN_THRESHOLD,
} from '../../src/components/optimize/scatterDownsample';

type Pt = { id: string; x: number; y: number; pin: boolean };

const getX = (p: Pt) => p.x;
const getY = (p: Pt) => p.y;
const getId = (p: Pt) => p.id;
const isPinned = (p: Pt) => p.pin;

const run = (pts: Pt[]) => downsampleForRender(pts, getX, getY, getId, isPinned);

describe('scatter downsampling', () => {
  it('hash01 is deterministic and in [0,1)', () => {
    expect(hash01('abc')).toBe(hash01('abc'));
    for (const s of ['', 'x', 'candidate-123', 'CAPE 1.75/0.5']) {
      const h = hash01(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('leaves small sets untouched', () => {
    const pts: Pt[] = Array.from({ length: SCATTER_THIN_THRESHOLD }, (_, i) => ({
      id: `p${i}`,
      x: Math.random(),
      y: Math.random(),
      pin: false,
    }));
    expect(run(pts)).toHaveLength(pts.length);
  });

  it('thins a large field toward the budget and is stable across calls', () => {
    const pts: Pt[] = Array.from({ length: 40_000 }, (_, i) => ({
      id: `p${i}`,
      // Uniform fill of the unit square.
      x: ((i * 2654435761) % 1000) / 1000,
      y: ((i * 40503) % 1000) / 1000,
      pin: false,
    }));
    const kept = run(pts);
    // Far fewer than the input, in the neighborhood of the budget.
    expect(kept.length).toBeLessThan(pts.length / 2);
    expect(kept.length).toBeLessThan(SCATTER_RENDER_BUDGET * 1.5);
    expect(kept.length).toBeGreaterThan(SCATTER_RENDER_BUDGET * 0.5);
    // Deterministic: same input → identical output ids.
    expect(run(pts).map(getId)).toEqual(kept.map(getId));
  });

  it('never drops a pinned point, even deep in the bottom-left', () => {
    const pts: Pt[] = Array.from({ length: 40_000 }, (_, i) => ({
      id: `p${i}`,
      x: ((i * 2654435761) % 1000) / 1000,
      y: ((i * 40503) % 1000) / 1000,
      // Pin 50 points pinned at the very bottom-left (would otherwise be thinned).
      pin: i < 50,
    }));
    // Force the pinned ones to the worst-case corner.
    for (let i = 0; i < 50; i++) {
      pts[i].x = 0;
      pts[i].y = 0;
    }
    const keptIds = new Set(run(pts).map(getId));
    for (let i = 0; i < 50; i++) expect(keptIds.has(`p${i}`)).toBe(true);
  });

  it('keeps the top-right (frontier) region far denser than the bottom-left', () => {
    // Equal-sized clusters at opposite corners; the top-right should survive at
    // a much higher rate than the bottom-left bulk.
    const pts: Pt[] = [];
    for (let i = 0; i < 20_000; i++) {
      pts.push({ id: `bl${i}`, x: 0.02 + (i % 100) / 5000, y: 0.02 + (i % 97) / 5000, pin: false });
    }
    for (let i = 0; i < 20_000; i++) {
      pts.push({ id: `tr${i}`, x: 0.98 - (i % 100) / 5000, y: 0.98 - (i % 97) / 5000, pin: false });
    }
    const kept = run(pts);
    const bl = kept.filter((p) => p.id.startsWith('bl')).length;
    const tr = kept.filter((p) => p.id.startsWith('tr')).length;
    expect(tr).toBeGreaterThan(bl * 5);
  });
});
