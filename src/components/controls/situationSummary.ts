import type { IncomeStream, OneTimeCashflow } from '../../engine/cashflows';

export const fmtK = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** Comma-grouped dollars for text inputs: 1234567 → "1,234,567". */
export const fmtThousands = (v: number) =>
  Math.round(v).toLocaleString('en-US');

/** Parse of fmtThousands (commas tolerated); null when not a number. */
export const parseThousands = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

/** Compact money for tight pill rows: $1.2M / $850k / $400. */
export const fmtCompact = (v: number) => {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return fmtK(v);
};

/** Short pill value, e.g. "$24k/yr" / "2 events" / "—". */
export function flowsPillValue(
  incomes: IncomeStream[],
  cashflows: OneTimeCashflow[],
): string {
  if (incomes.length > 0) {
    const total = incomes.reduce((sum, s) => sum + s.annual, 0);
    return `${fmtK(total)}/yr`;
  }
  if (cashflows.length > 0) {
    return `${cashflows.length} event${cashflows.length === 1 ? '' : 's'}`;
  }
  return '—';
}
