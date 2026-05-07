/**
 * Build historical.json from Robert Shiller's monthly ie_data CSV.
 *
 * Source file: public/data/ie_data.csv (Shiller's online dataset, exported
 * from ie_data.xls). Format:
 *   Date, S&P Comp. P, Dividend D, Earnings E, Price Index CPI, Date Fraction,
 *   Long Interest Rate GS10, Real Price, Real Dividend, Total Return Price,
 *   Real Earnings, TR Scaled Earnings, CAPE, TR CAPE, Excess CAPE Yield,
 *   Total Bond Returns (monthly factor), Total Bond Returns (cumulative index),
 *   ... (annualized returns, ignored)
 *
 * We compute annual real total returns by ratioing the published cumulative
 * total-return indices between successive Decembers and deflating by CPI.
 * Cleaner than reconstructing returns from price + dividend, and cleaner than
 * the par-bond duration approximation used in the prior version.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE_PATH = join(ROOT, 'public', 'data', 'ie_data.csv');
const OUT_PATH = join(ROOT, 'public', 'data', 'historical.json');

type MonthRow = {
  year: number;
  month: number;
  cpi: number;
  trp: number; // cumulative stock total return price
  bondTr: number; // cumulative bond total return index
};

/**
 * Minimal CSV row splitter that respects double-quoted fields. Handles the
 * embedded thousand separators in Shiller's "Total Return Price" column.
 */
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"') {
      inQuote = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const trimmed = s.replace(/,/g, '').trim();
  if (!trimmed || /^na$/i.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): { year: number; month: number } | null {
  // "1871.01" .. "2026.05". Use string split so .10/.11/.12 don't collide
  // with float quirks.
  const [y, m] = s.split('.');
  if (!y || !m) return null;
  const year = +y;
  const month = +m;
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function parseShiller(csv: string): MonthRow[] {
  const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
  const rows: MonthRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const date = parseDate(cols[0]);
    if (!date) continue;
    const cpi = parseNum(cols[4]);
    const trp = parseNum(cols[9]);
    const bondTr = parseNum(cols[16]);
    if (cpi == null || trp == null || bondTr == null) continue;
    rows.push({ year: date.year, month: date.month, cpi, trp, bondTr });
  }
  return rows;
}

function buildAnnual(rows: MonthRow[]) {
  // Index Decembers; we ratio successive Decembers for annual total returns.
  const decByYear = new Map<number, MonthRow>();
  for (const r of rows) if (r.month === 12) decByYear.set(r.year, r);
  const years = [...decByYear.keys()].sort((a, b) => a - b);

  const round = (x: number, p = 6) => {
    const f = Math.pow(10, p);
    return Math.round(x * f) / f;
  };

  const out = [];
  for (let i = 1; i < years.length; i++) {
    const y = years[i];
    const cur = decByYear.get(y)!;
    const prev = decByYear.get(years[i - 1])!;
    if (years[i - 1] !== y - 1) continue; // skip if there's a gap

    // Shiller publishes both "Total Return Price" (stocks) and "Total Bond
    // Returns" as REAL cumulative indices. Sanity check: TRP grows ~32,000×
    // from 1871 to 2024 ≈ 7.0% annualized, which only makes sense as real
    // (nominal would be ~700,000×). Same logic for bonds (39× ≈ 2.4%/yr
    // real). So we ratio successive Decembers to get real total returns
    // directly, then reconstruct nominal via the period CPI change.
    const stockReal = cur.trp / prev.trp - 1;
    const bondReal = cur.bondTr / prev.bondTr - 1;
    const inflation = cur.cpi / prev.cpi - 1;
    const stockNom = (1 + stockReal) * (1 + inflation) - 1;
    const bondNom = (1 + bondReal) * (1 + inflation) - 1;

    out.push({
      year: y,
      stock_return_nominal: round(stockNom),
      stock_return_real: round(stockReal),
      bond_return_nominal: round(bondNom),
      bond_return_real: round(bondReal),
      cash_return_nominal: null,
      cash_return_real: null,
      cpi: round(cur.cpi, 4),
      inflation: round(inflation),
    });
  }
  return out;
}

function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(
      `Missing ${SOURCE_PATH}. Drop Shiller's ie_data CSV at this path and re-run.`,
    );
    process.exit(1);
  }
  const csv = readFileSync(SOURCE_PATH, 'utf-8');
  const monthly = parseShiller(csv);
  const annual = buildAnnual(monthly);
  const meta = {
    start: annual[0].year,
    end: annual[annual.length - 1].year,
    frequency: 'annual',
    sources: { shiller: 'public/data/ie_data.csv' },
    notes:
      'Stock and bond annual returns are ratios of Shiller\'s published ' +
      'cumulative total-return indices (Total Return Price / Total Bond ' +
      'Returns) between successive Decembers, deflated by CPI. ' +
      'cash_return_* is null pending FRED TB3MS integration.',
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ meta, years: annual }, null, 2));
  console.log(
    `Wrote ${annual.length} years (${meta.start}–${meta.end}) to ${OUT_PATH}`,
  );
}

main();
