/**
 * Build historical.json from Shiller's monthly S&P 500 / CPI / 10y Treasury data.
 *
 * Source: https://github.com/datasets/s-and-p-500 (mirror of Robert Shiller's ie_data.xls)
 * Columns: Date, SP500, Dividend, Earnings, Consumer Price Index, Long Interest Rate, ...
 *
 * We compute, for every full calendar year:
 *   stock_return: total real return, monthly Shiller formula compounded
 *     R_m = (P_m + D_m/12) / P_{m-1}, deflated by CPI_{m-1}/CPI_m
 *   bond_return: 10y constant-maturity Treasury total return — coupon income plus
 *     price change from yield movement on a par bond, then deflated by CPI.
 *   cash_return: left null (need FRED TB3MS, fetch separately).
 *
 * Cache the raw CSV under scripts/.cache/ so re-runs are offline.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const OUT_PATH = join(ROOT, 'public', 'data', 'historical.json');

const SHILLER_URL =
  'https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv';

type MonthRow = {
  year: number;
  month: number;
  price: number;
  dividend: number; // annualized $ rate
  cpi: number;
  yield10: number; // long interest rate, percent
};

async function fetchCached(url: string, cachePath: string): Promise<string> {
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf-8');
  }
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  const body = await res.text();
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, body);
  return body;
}

function parseShiller(csv: string): MonthRow[] {
  const lines = csv.trim().split('\n');
  const rows: MonthRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const [y, m] = cols[0].split('-').map(Number);
    const price = +cols[1];
    const dividend = +cols[2];
    const cpi = +cols[4];
    const yield10 = +cols[5];
    // Recent rows may be sparse (price-only, others zero). We treat 0 as missing
    // for fields where 0 is not a plausible value.
    if (!price || !cpi || !dividend || !yield10) continue;
    rows.push({ year: y, month: m, price, dividend, cpi, yield10: yield10 / 100 });
  }
  return rows;
}

/**
 * Modified duration of an n-year par bond at yield y (annual coupons).
 *   D_mac = ((1+y)/y) * (1 - (1+y)^-n)
 *   D_mod = D_mac / (1+y)
 */
function modDurationParBond(y: number, n: number): number {
  if (y === 0) return n / 2; // limiting case
  const macaulay = ((1 + y) / y) * (1 - Math.pow(1 + y, -n));
  return macaulay / (1 + y);
}

/**
 * Annual nominal total return on a 10y constant-maturity par bond.
 *   coupon income  = y_start
 *   price change   ≈ -D_mod(y_start, 10) * (y_end - y_start)
 * This is the standard textbook (Bogle, Damodaran) approximation. Good enough
 * for a single-year horizon; the duration approximation breaks down for huge
 * yield moves but is fine across the historical record.
 */
function bondAnnualReturn(yStart: number, yEnd: number): number {
  const dMod = modDurationParBond(yStart, 10);
  return yStart - dMod * (yEnd - yStart);
}

function buildAnnual(rows: MonthRow[]) {
  // Group by year. We need months 1..12 to consider a year complete.
  const byYear = new Map<number, MonthRow[]>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);

  // Stock monthly nominal: R_m = (P_m + D_m/12) / P_{m-1}
  // We need the previous month for the first month of each year, so iterate
  // through the full row sequence and build a parallel monthly_real array.
  const sorted = [...rows].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
  );
  const monthlyReal = new Map<string, number>(); // key "yyyy-mm"
  const monthlyNominal = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const nominal = (cur.price + cur.dividend / 12) / prev.price;
    const real = nominal * (prev.cpi / cur.cpi);
    const key = `${cur.year}-${cur.month}`;
    monthlyNominal.set(key, nominal);
    monthlyReal.set(key, real);
  }

  const out: Array<{
    year: number;
    stock_return_nominal: number;
    stock_return_real: number;
    bond_return_nominal: number;
    bond_return_real: number;
    cash_return_nominal: number | null;
    cash_return_real: number | null;
    cpi: number;
    inflation: number;
  }> = [];

  for (const y of years) {
    const months = byYear.get(y)!;
    if (months.length !== 12) continue; // incomplete year
    const prevYearLast = byYear.get(y - 1);
    if (!prevYearLast) continue; // need t-1 for return calc

    // Compound 12 monthly returns
    let stockNom = 1;
    let stockReal = 1;
    let ok = true;
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${m}`;
      const n = monthlyNominal.get(k);
      const r = monthlyReal.get(k);
      if (n === undefined || r === undefined) {
        ok = false;
        break;
      }
      stockNom *= n;
      stockReal *= r;
    }
    if (!ok) continue;

    // Bond return: use January yield as start, next January yield as end
    const janCur = months.find((r) => r.month === 1);
    const janNext = byYear.get(y + 1)?.find((r) => r.month === 1);
    if (!janCur || !janNext) continue;
    const bondNom = bondAnnualReturn(janCur.yield10, janNext.yield10);

    // Inflation: December CPI / previous December CPI
    const decCur = months.find((r) => r.month === 12)!;
    const decPrev = prevYearLast.find((r) => r.month === 12);
    if (!decPrev) continue;
    const inflation = decCur.cpi / decPrev.cpi - 1;
    const bondReal = (1 + bondNom) / (1 + inflation) - 1;

    out.push({
      year: y,
      stock_return_nominal: round(stockNom - 1),
      stock_return_real: round(stockReal - 1),
      bond_return_nominal: round(bondNom),
      bond_return_real: round(bondReal),
      cash_return_nominal: null,
      cash_return_real: null,
      cpi: round(decCur.cpi, 4),
      inflation: round(inflation),
    });
  }
  return out;
}

function round(x: number, places = 6): number {
  const f = Math.pow(10, places);
  return Math.round(x * f) / f;
}

async function main() {
  const csv = await fetchCached(SHILLER_URL, join(CACHE_DIR, 'shiller.csv'));
  const monthly = parseShiller(csv);
  const annual = buildAnnual(monthly);
  const meta = {
    start: annual[0].year,
    end: annual[annual.length - 1].year,
    frequency: 'annual',
    sources: { shiller: SHILLER_URL },
    notes:
      'cash_return_* is null pending FRED TB3MS integration. ' +
      'Bond returns use a 10y par-bond duration approximation on Shiller GS10 yields.',
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ meta, years: annual }, null, 2));
  console.log(
    `Wrote ${annual.length} years (${meta.start}–${meta.end}) to ${OUT_PATH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
