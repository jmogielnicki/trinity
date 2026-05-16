export type Weights = { stock: number; bond: number; cash: number };

export type Sleeves = { stock: number; bond: number; cash: number };

export type Sleeve = keyof Sleeves;

export type AnnualReturns = {
  year: number;
  stock_return_nominal: number;
  stock_return_real: number;
  bond_return_nominal: number;
  bond_return_real: number;
  cash_return_nominal: number | null;
  cash_return_real: number | null;
  cpi: number;
  inflation: number;
};

export type HistoricalSeries = {
  start: number;
  end: number;
  years: AnnualReturns[];
  byYear: Map<number, AnnualReturns>;
};

export type YearStateRecord = {
  t: number;
  calendarYear: number;
  balance: number;
  withdrawal: number;
  weights: Weights;
  /** Post-return per-sleeve balances (real $). */
  sleeves: Sleeves;
  return?: number;
  depleted?: boolean;
};

export type YearState = {
  t: number;
  balance: number;
  calendarYear: number;
  trajectory: YearStateRecord[];
};

export type SimulationResult = {
  startYear: number;
  trajectory: YearStateRecord[];
  success: boolean;
  inProgress: boolean;
  bootstrapped: boolean;
  prefixYears: number;
  finalBalance?: number;
  depletedAt?: number;
  /**
   * Aggregation weight for stats. 1 for an observed cohort (one start year =
   * one sim); 1/samplesPerPrefix for a bootstrap sample, so a cohort's N
   * samples together count as a single start year rather than N. Unset is
   * treated as 1.
   */
  weight?: number;
};

export type ScenarioResult = {
  sims: SimulationResult[];
  /**
   * Success rate over fully-observed historical cohorts only — a hard
   * historical fact. Bootstrap-projected cohorts are reported separately
   * via projectedSuccessRate so observed and sampled never blend.
   */
  successRate: number;
  /** Fully-observed completed cohorts (the successRate denominator). */
  completedCount: number;
  /** Truncate-mode in-progress cohorts (excluded from successRate). */
  inProgressCount: number;
  /**
   * Success rate over bootstrap cohorts, equal-weighted per start year.
   * Undefined when the scenario used no bootstrap tails.
   */
  projectedSuccessRate?: number;
  /** Number of distinct start years represented by bootstrap cohorts. */
  projectedCohortCount?: number;
  percentiles: PercentileBand[];
  /**
   * Start year of the most severe observed failure — the cohort whose
   * portfolio depleted earliest. Undefined when no observed cohort failed.
   */
  worstStartYear?: number;
};

export type PercentileBand = {
  t: number;
  values: { p5: number; p25: number; p50: number; p75: number; p95: number };
};
