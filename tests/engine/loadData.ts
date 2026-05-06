import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeries, type RawHistorical } from '../../src/data/load';
import type { HistoricalSeries } from '../../src/engine/types';

export function loadHistoricalFromDisk(): HistoricalSeries {
  const path = join(process.cwd(), 'public', 'data', 'historical.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as RawHistorical;
  return buildSeries(raw);
}
