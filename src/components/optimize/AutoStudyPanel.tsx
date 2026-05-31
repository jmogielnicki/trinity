import { useMemo } from 'react';
import { NumericInput } from '../controls/NumericInput';
import { Button } from '../ui/Button';
import { FIELD_SM } from '../ui/fieldCls';
import { useOptimizeStore } from '../../store/optimizeStore';
import { autoCandidateCounts } from '../../engine/study';

const fmtPct = (v: number) => String(+(v * 100).toFixed(4));
const parsePct = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
};

/**
 * Auto-mode config: pick a floor withdrawal rate and a minimum success rate,
 * then run the all-dimensions sweep. Min success is a *run* filter here —
 * candidates below it are discarded inside the workers so the (huge) sweep
 * fits in memory, which means lowering it requires a re-run.
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

  const counts = useMemo(
    () => autoCandidateCounts({ minWithdrawalRate, horizonYears }),
    [minWithdrawalRate, horizonYears],
  );

  return (
    <div className="flex flex-col gap-3.5 border border-border-light rounded p-3.5 bg-surface-panel">
      <div className="text-text-secondary text-sm max-w-[640px] leading-[1.4]">
        <strong>Auto mode</strong> — sweeps every fixed and glide holdings mix
        (10% increments, stocks ≥ 50%), a spread of fixed / ratchet / curve
        withdrawal strategies, and all four withdrawal sources at once. Only
        plans that clear your minimum success rate are kept (the rest are
        discarded as they run, to stay within memory). Pick the floor
        withdrawal rate and minimum success rate, then run.
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

      <div className="text-xs text-text-muted">
        ≈ {counts.total.toLocaleString()} plans ({counts.allocations} mixes ×{' '}
        {counts.withdrawals} withdrawals × {counts.sources} sources), each run
        against all historical start years. Only plans at or above the minimum
        success rate are kept — lower it and re-run to widen the field.
      </div>
    </div>
  );
}
