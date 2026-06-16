import { useEffect, useState } from 'react';
import {
  DEFAULT_SOLVE_TARGET,
  type BalanceSolveResult,
  type RateSolveResult,
} from '../../engine/solve';
import type { Scenario } from '../../engine/sweep';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';

const TARGETS = [0.9, 0.95, 1.0];

/**
 * Inverts the calculator: instead of "given these inputs, what's the success
 * rate," it solves "what rate / balance hits my target success." Both are
 * bisections in a worker (see engine/solve.ts) against the OBSERVED historical
 * success rate, so the answer matches the headline number the StatPanel shows.
 */
export function SolverPanel() {
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const scenario = useScenarioStore();
  const [target, setTarget] = useState(DEFAULT_SOLVE_TARGET);
  const [busy, setBusy] = useState<null | 'rate' | 'number'>(null);
  const [rateResult, setRateResult] = useState<RateSolveResult | null>(null);
  const [numberResult, setNumberResult] = useState<BalanceSolveResult | null>(null);

  const ready = pool != null && data != null;

  // Any change to the plan or the target invalidates a solved figure — clear so
  // a stale number never sits next to inputs it no longer reflects.
  useEffect(() => {
    setRateResult(null);
    setNumberResult(null);
  }, [
    target,
    scenario.initialBalance,
    scenario.horizonYears,
    scenario.allocation,
    scenario.withdrawal,
    scenario.withdrawalSource,
    scenario.incomes,
    scenario.cashflows,
  ]);

  const baseScenario = (): Scenario => ({
    initialBalance: scenario.initialBalance,
    horizonYears: scenario.horizonYears,
    allocation: scenario.allocation,
    withdrawal: scenario.withdrawal,
    withdrawalSource: scenario.withdrawalSource,
    incomes: scenario.incomes,
    cashflows: scenario.cashflows,
    tailMethod: scenario.tailMethod,
  });

  const findRate = async () => {
    if (!pool) return;
    setBusy('rate');
    try {
      setRateResult(await pool.solveSafeRate(baseScenario(), target));
    } finally {
      setBusy(null);
    }
  };

  const findNumber = async () => {
    if (!pool) return;
    setBusy('number');
    try {
      setNumberResult(await pool.solveNumber(baseScenario(), target));
    } finally {
      setBusy(null);
    }
  };

  const pct = Math.round(target * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-text">
          Answer the question
        </h3>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Target success
          <TabBar>
            {TARGETS.map((t) => (
              <ToggleButton
                key={t}
                active={target === t}
                onClick={() => setTarget(t)}
              >
                {Math.round(t * 100)}%
              </ToggleButton>
            ))}
          </TabBar>
        </label>
      </div>

      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3">
        <Solve
          title="Find my safe rate"
          blurb="Highest fixed withdrawal % your plan survives historically."
          actionLabel="Find my safe rate"
          loading={busy === 'rate'}
          disabled={!ready || busy !== null}
          onClick={findRate}
          result={rateResult && <RateReadout result={rateResult} pct={pct} />}
        />
        <Solve
          title="Find my number"
          blurb="Smallest starting balance that funds your fixed spending."
          actionLabel="Find my number"
          loading={busy === 'number'}
          disabled={!ready || busy !== null}
          onClick={findNumber}
          result={numberResult && <NumberReadout result={numberResult} pct={pct} />}
        />
      </div>
      <p className="text-2xs text-text-faint leading-tight">
        Solved against observed historical sequences (truncate mode), holding
        your allocation, horizon, income and one-time cash flows fixed.
      </p>
    </div>
  );
}

function Solve({
  title,
  blurb,
  actionLabel,
  loading,
  disabled,
  onClick,
  result,
}: {
  title: string;
  blurb: string;
  actionLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  result: React.ReactNode;
}) {
  return (
    <div className="bg-surface-muted rounded-md p-3 flex flex-col gap-2">
      <div className="text-sm font-semibold text-text">{title}</div>
      <div className="text-xs text-text-muted leading-[1.4]">{blurb}</div>
      <Button
        variant="soft"
        size="sm"
        fullWidth
        disabled={disabled}
        onClick={onClick}
      >
        {loading ? 'Solving…' : actionLabel}
      </Button>
      {result}
    </div>
  );
}

function Readout({
  value,
  caption,
}: {
  value?: string;
  caption: React.ReactNode;
}) {
  return (
    <div className="mt-0.5">
      {value && (
        <div className="num text-2xl font-bold text-primary leading-none">
          {value}
        </div>
      )}
      <div className="text-xs text-text-muted leading-[1.4] mt-1.5">{caption}</div>
    </div>
  );
}

function RateReadout({ result, pct }: { result: RateSolveResult; pct: number }) {
  if (result.status === 'notApplicable')
    return <Readout caption={result.reason} />;
  if (result.status === 'allSucceed')
    return (
      <Readout
        value={`> ${(result.rate * 100).toFixed(0)}%`}
        caption={`Even ${(result.rate * 100).toFixed(0)}% clears ${pct}% — your plan isn't rate-limited (income likely covers most spending).`}
      />
    );
  return (
    <Readout
      value={`${(result.rate * 100).toFixed(2)}%`}
      caption={`Highest fixed rate that survives in at least ${pct}% of historical retirements (actual ${(result.successRate * 100).toFixed(1)}%).`}
    />
  );
}

function NumberReadout({
  result,
  pct,
}: {
  result: BalanceSolveResult;
  pct: number;
}) {
  if (result.status === 'notApplicable')
    return <Readout caption={result.reason} />;
  if (result.status === 'allSucceed')
    return (
      <Readout
        caption={`Even a small balance clears ${pct}% at ${fmtDollars(result.annualSpend)}/yr — your spending is already covered (likely by income).`}
      />
    );
  if (result.status === 'noneSucceed')
    return (
      <Readout
        caption={`No starting balance reaches ${pct}% at ${fmtDollars(result.annualSpend)}/yr — that spending is too high for this plan. Trim spending or relax the target.`}
      />
    );
  return (
    <Readout
      value={fmtDollars(result.balance)}
      caption={`To spend ${fmtDollars(result.annualSpend)}/yr (fixed, real) and survive in at least ${pct}% of historical retirements (actual ${(result.successRate * 100).toFixed(1)}%).`}
    />
  );
}

function fmtDollars(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
