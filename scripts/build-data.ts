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
const SHILLER_PATH = join(ROOT, 'public', 'data', 'ie_data.csv');
const TBILL_PATH = join(ROOT, 'public', 'data', 'TB3MS.csv');
const OUT_PATH = join(ROOT, 'public', 'data', 'historical.json');

type MonthRow = {
  year: number;
  month: number;
  cpi: number;
  trp: number; // cumulative stock total return price
  bondTr: number; // cumulative bond total return index
  cape: number | null; // Shiller CAPE (P/E10); null before ~1881
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

type ShillerColumns = { cpi: number; trp: number; bondTr: number; cape: number | null };

/**
 * Resolve the columns we need by header name rather than by hardcoded index.
 * Shiller occasionally inserts columns; a fixed index would then silently
 * read the wrong series (e.g. a nominal index where we expect a real one).
 * Throws loudly with the actual header if a column can't be found.
 */
function resolveColumns(headerLine: string): ShillerColumns {
  const header = splitCsvRow(headerLine).map((h) => h.trim());
  const find = (label: string, match: (h: string) => boolean): number => {
    const idx = header.findIndex(match);
    if (idx < 0) {
      throw new Error(
        `Shiller CSV: could not locate the "${label}" column.\n` +
          `Header was: ${header.join(' | ')}`,
      );
    }
    return idx;
  };
  const cpi = find('Price Index CPI', (h) => /\bCPI\b/i.test(h));
  const trp = find(
    'Total Return Price',
    (h) => h.toLowerCase() === 'total return price',
  );
  // Shiller publishes two "Total Bond Returns" columns: a monthly return
  // factor followed by a cumulative index. We ratio the cumulative index,
  // which is the second occurrence.
  const bondCols = header
    .map((h, i) => ({ h, i }))
    .filter((c) => /total bond returns/i.test(c.h));
  if (bondCols.length < 2) {
    throw new Error(
      `Shiller CSV: expected two "Total Bond Returns" columns (monthly ` +
        `factor + cumulative index), found ${bondCols.length}.\n` +
        `Header was: ${header.join(' | ')}`,
    );
  }
  // CAPE column: "Ratio P/E10 or CAPE" — must not match "TR CAPE" variant.
  // Use index -1 (absent) gracefully so pre-1881 NAs don't crash the build.
  const capeIdx = header.findIndex(
    (h) => /\bCAPE\b/i.test(h) && !/\bTR\b/i.test(h),
  );
  return { cpi, trp, bondTr: bondCols[1].i, cape: capeIdx >= 0 ? capeIdx : null };
}

function parseShiller(csv: string): MonthRow[] {
  const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
  const col = resolveColumns(lines[0]);
  const rows: MonthRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const date = parseDate(cols[0]);
    if (!date) continue;
    const cpi = parseNum(cols[col.cpi]);
    const trp = parseNum(cols[col.trp]);
    const bondTr = parseNum(cols[col.bondTr]);
    if (cpi == null || trp == null || bondTr == null) continue;
    const cape = col.cape != null ? parseNum(cols[col.cape]) : null;
    rows.push({ year: date.year, month: date.month, cpi, trp, bondTr, cape });
  }
  return rows;
}

/**
 * Parse FRED TB3MS.csv: observation_date,TB3MS where TB3MS is the monthly
 * average secondary-market 3-month T-bill rate, percent annualized. Returns
 * a Map keyed "YYYY-MM" → rate as a decimal (e.g. 0.0072 for 0.72%).
 */
function parseTbill(csv: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const [y, m] = cols[0].split('-');
    const rate = parseNum(cols[1]);
    if (!y || !m || rate == null) continue;
    out.set(`${+y}-${+m}`, rate / 100);
  }
  return out;
}

/**
 * Compound monthly T-bill factors across calendar year y. Returns null if
 * any month is missing — that means we don't have a full year (pre-1934 or
 * the still-in-progress year).
 */
function annualTbillNominal(
  year: number,
  monthlyRates: Map<string, number>,
): number | null {
  let factor = 1;
  for (let m = 1; m <= 12; m++) {
    const r = monthlyRates.get(`${year}-${m}`);
    if (r == null) return null;
    factor *= 1 + r / 12;
  }
  return factor - 1;
}

function buildAnnual(
  rows: MonthRow[],
  tbill: Map<string, number>,
) {
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

    const cashNom = annualTbillNominal(y, tbill);
    const cashReal =
      cashNom == null ? null : (1 + cashNom) / (1 + inflation) - 1;

    out.push({
      year: y,
      stock_return_nominal: round(stockNom),
      stock_return_real: round(stockReal),
      bond_return_nominal: round(bondNom),
      bond_return_real: round(bondReal),
      cash_return_nominal: cashNom == null ? null : round(cashNom),
      cash_return_real: cashReal == null ? null : round(cashReal),
      cpi: round(cur.cpi, 4),
      inflation: round(inflation),
      // December CAPE for this year; null before ~1881 (requires 10y earnings)
      cape: cur.cape != null ? round(cur.cape, 2) : null,
    });
  }
  return out;
}

/**
 * Guard against a column mix-up: ratioing a nominal index where a real one
 * is expected (or the reverse) silently shifts every return by inflation.
 * Real total returns over 1871+ run ~7%/yr for stocks and ~2.5%/yr for
 * bonds; wide bands here catch a gross misread without tripping on normal
 * data revisions.
 */
function assertSaneReturns(
  annual: { stock_return_real: number; bond_return_real: number }[],
): void {
  if (annual.length === 0) throw new Error('No annual rows produced.');
  const cagr = (pick: (r: (typeof annual)[number]) => number): number => {
    let logSum = 0;
    for (const r of annual) logSum += Math.log(1 + pick(r));
    return Math.expm1(logSum / annual.length);
  };
  const stock = cagr((r) => r.stock_return_real);
  const bond = cagr((r) => r.bond_return_real);
  if (stock < 0.04 || stock > 0.1) {
    throw new Error(
      `Stock real CAGR ${(stock * 100).toFixed(2)}% is outside the sane ` +
        `[4%, 10%] band — likely a Shiller column mix-up (a nominal index ` +
        `read as real?).`,
    );
  }
  if (bond < 0 || bond > 0.05) {
    throw new Error(
      `Bond real CAGR ${(bond * 100).toFixed(2)}% is outside the sane ` +
        `[0%, 5%] band — likely a Shiller column mix-up.`,
    );
  }
}

function main() {
  if (!existsSync(SHILLER_PATH)) {
    console.error(
      `Missing ${SHILLER_PATH}. Drop Shiller's ie_data CSV at this path and re-run.`,
    );
    process.exit(1);
  }
  const csv = readFileSync(SHILLER_PATH, 'utf-8');
  const monthly = parseShiller(csv);
  const tbill = existsSync(TBILL_PATH)
    ? parseTbill(readFileSync(TBILL_PATH, 'utf-8'))
    : new Map<string, number>();
  const annual = buildAnnual(monthly, tbill);
  assertSaneReturns(annual);
  const yearsWithCash = annual.filter((r) => r.cash_return_real != null);
  const meta = {
    start: annual[0].year,
    end: annual[annual.length - 1].year,
    cash_start: yearsWithCash.length ? yearsWithCash[0].year : null,
    cash_end: yearsWithCash.length
      ? yearsWithCash[yearsWithCash.length - 1].year
      : null,
    frequency: 'annual',
    sources: {
      shiller: 'public/data/ie_data.csv',
      tbill: tbill.size ? 'public/data/TB3MS.csv' : null,
    },
    notes:
      "Stock and bond annual real returns are ratios of Shiller's published " +
      'cumulative total-return indices (Total Return Price / Total Bond ' +
      'Returns) between successive Decembers; nominal is reconstructed via ' +
      'CPI. Cash returns are FRED TB3MS monthly factors compounded across ' +
      'each calendar year; pre-1934 years stay null.',
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ meta, years: annual }, null, 2));
  console.log(
    `Wrote ${annual.length} years (${meta.start}–${meta.end}) to ${OUT_PATH}; ` +
      `cash for ${yearsWithCash.length} years (${meta.cash_start ?? '—'}–${meta.cash_end ?? '—'})`,
  );
}

main();
