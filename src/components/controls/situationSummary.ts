import type { IncomeStream, OneTimeCashflow } from '../../engine/cashflows';

export const fmtK = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** Compact money for tight pill rows: $1.2M / $850k / $400. */
export const fmtCompact = (v: number) => {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return fmtK(v);
};

/** One-line summary of the external cash flows, e.g. "Social Security $24k/yr · 1 event". */
export function flowsSummary(
  incomes: IncomeStream[],
  cashflows: OneTimeCashflow[],
): string {
  const parts: string[] = [];
  if (incomes.length === 1) {
    const s = incomes[0];
    parts.push(`${s.label?.trim() || 'Income'} ${fmtK(s.annual)}/yr`);
  } else if (incomes.length > 1) {
    parts.push(`${incomes.length} income streams`);
  }
  if (cashflows.length > 0) {
    parts.push(`${cashflows.length} event${cashflows.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

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
