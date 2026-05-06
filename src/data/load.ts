import type { AnnualReturns, HistoricalSeries } from '../engine/types';

export type RawHistorical = {
  meta: {
    start: number;
    end: number;
    frequency: string;
    sources?: Record<string, string>;
    notes?: string;
  };
  years: AnnualReturns[];
};

export function buildSeries(raw: RawHistorical): HistoricalSeries {
  const byYear = new Map<number, AnnualReturns>();
  for (const r of raw.years) byYear.set(r.year, r);
  return {
    start: raw.meta.start,
    end: raw.meta.end,
    years: raw.years,
    byYear,
  };
}

let cached: Promise<HistoricalSeries> | null = null;

export function loadHistorical(): Promise<HistoricalSeries> {
  if (!cached) {
    cached = fetch('/data/historical.json')
      .then((r) => r.json() as Promise<RawHistorical>)
      .then(buildSeries);
  }
  return cached;
}
