import { useMemo } from 'react';
import { NumericInput } from '../controls/NumericInput';
import { Button } from '../ui/Button';
import { FIELD_SM } from '../ui/fieldCls';
import { useOptimizeStore } from '../../store/optimizeStore';
import { autoSearchSummary } from '../../engine/study';

const fmtPct = (v: number) => String(+(v * 100).toFixed(4));
const parsePct = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
};

/**
 * Auto-mode config: pick a floor withdrawal rate and a minimum success rate,
 * then run the laddered all-dimensions search. Each [allocation, source,
 * strategy] ladder climbs its withdrawal rate from the floor and stops the
 * moment a rung drops below the success target — so the threshold is a *run*
 * filter (lowering it requires a re-run), and the search skips the bulk of
 * doomed simulations.
 */
export function AutoStudyPanel({
  horizonYears,
  disabled,
  running,
  hasResults,
  onRun,
}: {
  horizonYears: number;
  disabled: boolean;
  running: boolean;
  hasResults: boolean;
  onRun: () => void;
}) {
  const minWithdrawalRate = useOptimizeStore((s) => s.minWithdrawalRate);
  const setMinWithdrawalRate = useOptimizeStore((s) => s.setMinWithdrawalRate);
  const minSuccessRate = useOptimizeStore((s) => s.minSuccessRate);
  const setMinSuccessRate = useOptimizeStore((s) => s.setMinSuccessRate);
  const progressDone = useOptimizeStore((s) => s.progressDone);
  const progressTotal = useOptimizeStore((s) => s.progressTotal);

  const summary = useMemo(() => autoSearchSummary(horizonYears), [horizonYears]);

  const pctDone =
    progressTotal > 0 ? Math.min(100, (progressDone / progressTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-3.5 border border-border-light rounded p-3.5 bg-surface-panel">
      <div className="text-text-secondary text-sm max-w-[640px] leading-[1.4]">
        <strong>Auto mode</strong> — sweeps every fixed and glide holdings mix
        (10% increments, stocks ≥ 50%) against fixed %, ratchet, and curve
        withdrawals across all four sources. Each combination climbs its
        withdrawal rate from your floor upward and stops once it can no longer
        clear your minimum success rate. Pick the floor and the minimum success
        rate, then run.
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          <span className="font-semibold">Min withdrawal rate</span>
          <span className="flex items-center gap-1">
            <NumericInput
              className={FIELD_SM}
              value={minWithdrawalRate}
              format={fmtPct}
              parse={parsePct}
              min={0}
              max={0.05}
              onChange={setMinWithdrawalRate}
            />
            %
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          <span className="font-semibold">Min success rate</span>
          <span className="flex items-center gap-1">
            <NumericInput
              className={FIELD_SM}
              value={minSuccessRate}
              format={fmtPct}
              parse={parsePct}
              min={0}
              max={1}
              onChange={setMinSuccessRate}
            />
            %
          </span>
        </label>

        <div className="flex flex-col gap-1.5 items-start">
          <Button onClick={onRun} disabled={disabled} className="px-6 py-3">
            {running ? 'Running…' : hasResults ? 'Re-run' : 'Go'}
          </Button>
        </div>
      </div>

      {(running || progressDone > 0) && (
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
              style={{ width: `${pctDone}%` }}
            />
          </div>
          <div className="flex justify-between text-2xs text-text-muted tabular-nums">
            <span>
              {running ? 'Simulating…' : 'Done'} {progressDone.toLocaleString()}
              {' / '}
              {progressTotal.toLocaleString()} simulations
            </span>
            <span>{pctDone.toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="text-xs text-text-muted">
        {summary.ladders.toLocaleString()} ladders ({summary.allocations} mixes ×{' '}
        {summary.sources} sources × 6 strategies), each climbing from your floor
        to ≈5–6% against all historical start years. Early termination skips
        rates that can't clear your success target, so the actual simulation
        count is usually far lower than the bar's maximum.
      </div>
    </div>
  );
}
