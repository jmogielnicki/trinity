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
};

export type ScenarioResult = {
  sims: SimulationResult[];
  successRate: number;
  completedCount: number;
  inProgressCount: number;
  percentiles: PercentileBand[];
  worstStartYear?: number;
};

export type PercentileBand = {
  t: number;
  values: { p5: number; p25: number; p50: number; p75: number; p95: number };
};
