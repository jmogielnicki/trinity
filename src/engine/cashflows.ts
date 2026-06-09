/**
 * External cash flows — money that enters or leaves the plan outside the
 * portfolio itself. Everything is in real (today's) dollars, like every other
 * figure the engine handles; Social Security and most pensions are
 * COLA-adjusted, so a constant real amount is the natural representation.
 *
 * Income offsets portfolio withdrawals: the withdrawal strategy still defines
 * total annual spending, and the portfolio only has to fund the part income
 * doesn't cover. When income (plus one-time inflows) exceeds spending, the
 * surplus is invested back into the portfolio.
 */

/** Recurring income stream, e.g. Social Security, a pension, an annuity. */
export type IncomeStream = {
  label?: string;
  /** Real $ per year. */
  annual: number;
  /** Years into retirement when payments begin (0 = first year). */
  startsAtYear: number;
  /** Optional last year paid (inclusive, years into retirement). Omit for lifelong. */
  endsAtYear?: number;
};

/** One-time cash flow: positive = inflow (downsizing, inheritance), negative = expense. */
export type OneTimeCashflow = {
  label?: string;
  /** Real $. */
  amount: number;
  /** Years into retirement when it occurs. */
  atYear: number;
};

/** Total recurring income received in year t (always ≥ 0). */
export function incomeAt(
  incomes: IncomeStream[] | undefined,
  t: number,
): number {
  if (!incomes || incomes.length === 0) return 0;
  let sum = 0;
  for (const s of incomes) {
    if (s.annual <= 0) continue;
    if (t < s.startsAtYear) continue;
    if (s.endsAtYear != null && t > s.endsAtYear) continue;
    sum += s.annual;
  }
  return sum;
}

/** Net one-time cash flow in year t (any sign). */
export function cashflowAt(
  flows: OneTimeCashflow[] | undefined,
  t: number,
): number {
  if (!flows || flows.length === 0) return 0;
  let sum = 0;
  for (const f of flows) {
    if (f.atYear === t) sum += f.amount;
  }
  return sum;
}
