import { describe, expect, it } from 'vitest';
import { loadHistoricalFromDisk } from './loadData';

/**
 * Pin the actual return values for a handful of well-known years against
 * external sources. Catches regressions in the build pipeline (column shift,
 * sign flip, double-deflation, etc.) that the Bengen/Trinity success-rate
 * tests would only catch indirectly.
 *
 * Tolerance is ±1pp absolute, which is loose enough to absorb small Shiller
 * data revisions and end-of-month-vs-monthly-average conventions, but tight
 * enough to flag a methodology bug.
 */

const data = loadHistoricalFromDisk();
const ABS_TOL = 0.01;

function pick(year: number) {
  const r = data.byYear.get(year);
  if (!r) throw new Error(`missing year ${year}`);
  return r;
}

describe('data: stock real total returns vs published Shiller', () => {
  // Sources: Shiller's published series; cross-checked against S&P 500 TR
  // index histories.
  const cases: Array<[number, number, string]> = [
    [1933, 0.5325, 'Great Depression rebound (S&P TR ≈ +54%, CPI +0.8%)'],
    [1974, -0.342, 'oil shock + stagflation'],
    [1995, 0.3499, 'mid-90s bull (S&P TR ≈ +37.6%)'],
    [2008, -0.393, 'GFC'],
    [2020, 0.169, 'pandemic recovery'],
    [2022, -0.201, 'inflation + tightening'],
  ];
  for (const [year, expected, label] of cases) {
    it(`${year} real ≈ ${(expected * 100).toFixed(1)}% (${label})`, () => {
      expect(pick(year).stock_return_real).toBeCloseTo(expected, 2);
      expect(
        Math.abs(pick(year).stock_return_real - expected),
      ).toBeLessThan(ABS_TOL);
    });
  }
});

describe('data: bond real total returns vs published Shiller', () => {
  const cases: Array<[number, number, string]> = [
    [1980, -0.142, 'Volcker rate hike'],
    [2008, 0.193, 'flight to safety'],
    [2022, -0.202, 'dual crash'],
  ];
  for (const [year, expected, label] of cases) {
    it(`${year} real ≈ ${(expected * 100).toFixed(1)}% (${label})`, () => {
      expect(
        Math.abs(pick(year).bond_return_real - expected),
      ).toBeLessThan(ABS_TOL);
    });
  }
});

describe('data: nominal cash returns vs FRED TB3MS', () => {
  // Compounded monthly TB3MS factors. Spot checks against the published
  // monthly average rates.
  const cases: Array<[number, number, string]> = [
    [1934, 0.0028, 'depression-era floor'],
    [1980, 0.1205, 'Volcker peak'],
    [2008, 0.0137, 'pre-ZIRP descent'],
    [2020, 0.0037, 'pandemic ZIRP'],
    [2024, 0.0508, 'current cycle peak'],
  ];
  for (const [year, expected, label] of cases) {
    it(`${year} nominal ≈ ${(expected * 100).toFixed(2)}% (${label})`, () => {
      const r = pick(year).cash_return_nominal;
      expect(r).not.toBeNull();
      expect(Math.abs(r! - expected)).toBeLessThan(ABS_TOL);
    });
  }
});

describe('data: inflation vs published CPI-U', () => {
  const cases: Array<[number, number, string]> = [
    [1932, -0.103, 'deflation'],
    [1974, 0.123, 'oil shock'],
    [1980, 0.125, 'stagflation peak'],
    [2009, 0.027, 'post-crisis low'],
    [2022, 0.0646, 'recent peak'],
  ];
  for (const [year, expected, label] of cases) {
    it(`${year} inflation ≈ ${(expected * 100).toFixed(1)}% (${label})`, () => {
      expect(Math.abs(pick(year).inflation - expected)).toBeLessThan(ABS_TOL);
    });
  }
});

describe('data: coverage', () => {
  it('covers at least 1872–2025 for stocks/bonds', () => {
    expect(data.start).toBeLessThanOrEqual(1872);
    expect(data.end).toBeGreaterThanOrEqual(2025);
  });

  it('cash coverage starts in 1934 (FRED TB3MS) and runs to data.end', () => {
    expect(pick(1933).cash_return_real).toBeNull();
    expect(pick(1934).cash_return_real).not.toBeNull();
    expect(pick(data.end).cash_return_real).not.toBeNull();
  });

  it('every year has stock + bond + inflation populated', () => {
    for (const r of data.years) {
      expect(r.stock_return_real, `stock ${r.year}`).toBeTypeOf('number');
      expect(r.bond_return_real, `bond ${r.year}`).toBeTypeOf('number');
      expect(r.inflation, `inflation ${r.year}`).toBeTypeOf('number');
    }
  });
});
