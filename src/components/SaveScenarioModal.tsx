import { Fragment, useState } from 'react';
import { authConfigured } from '../auth';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useSweepStore } from '../store/sweepStore';
import { IconButton } from './ui/IconButton';
import {
  fmtMoney,
  describeAllocation, describeWithdrawal,
  allocTypeName, wdTypeName, srcTypeName,
  allocRows, wdRows, srcRows,
} from '../engine/strategyDescriptions';
import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';
import type { SerializedState } from '../data/urlState';

function fmtBalance(n: number): string {
  if (n >= 1_000_000) return fmtMoney(n);
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function defaultName(a: AllocationStrategy, w: WithdrawalStrategy, horizon: number): string {
  return `${describeAllocation(a)} · ${describeWithdrawal(w)} · ${horizon}yr`;
}

type Props = {
  onClose: () => void;
  /**
   * Override the strategy being saved. When omitted, the modal saves the
   * currently-active Build scenario (legacy behavior). Optimize-tab callers
   * pass a candidate-derived state so the saved entry reflects the variant,
   * not whatever's loaded in Build.
   */
  override?: SerializedState;
  /** Default name when override is provided. Falls back to a describe-derived label. */
  defaultName?: string;
  /**
   * Optional follow-up action shown as a checkbox under the name field. When
   * checked at save time, fires after the library write succeeds (the
   * SerializedState that was just saved is passed back, plus the chosen name).
   */
  postSaveAction?: {
    label: string;
    onAction: (saved: SerializedState, name: string) => void;
  };
};

export function SaveScenarioModal({
  onClose,
  override,
  defaultName: defaultNameProp,
  postSaveAction,
}: Props) {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const { save } = useLibraryStore();
  const authed = useAuthStore((s) => s.status === 'authed');
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const showCloudNudge = authConfigured && !authed;

  // What we'll actually save — caller-supplied override beats the Build scenario.
  const state: SerializedState = override ?? {
    initialBalance: scenario.initialBalance,
    horizonYears: scenario.horizonYears,
    allocation: scenario.allocation,
    withdrawal: scenario.withdrawal,
    axes: sweep.axes,
    tailMethod: scenario.tailMethod,
    withdrawalSource: scenario.withdrawalSource,
  };

  const [name, setName] = useState(
    () =>
      defaultNameProp ??
      defaultName(state.allocation, state.withdrawal, state.horizonYears),
  );
  const [doPostAction, setDoPostAction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await save(name, state);
      if (postSaveAction && doPostAction) postSaveAction.onAction(state, name);
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Save failed');
      setBusy(false);
    }
  };

  const signInToSave = () => {
    onClose();
    setAuthModalOpen(true);
  };

  const aRows = allocRows(state.allocation);
  const wRows = wdRows(state.withdrawal);
  const sRows = srcRows(state.withdrawalSource);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[420px] flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-text">Save strategy</h2>
          <IconButton onClick={onClose} aria-label="Close">✕</IconButton>
        </div>

        {/* Strategy summary */}
        <div className="bg-surface-panel rounded-lg p-3 text-base">
          <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 items-baseline">

            {/* Portfolio */}
            <div className="text-text-muted">Balance</div>
            <div className="text-text font-medium">{fmtBalance(state.initialBalance)}</div>
            <div className="text-text-muted">Horizon</div>
            <div className="text-text font-medium">{state.horizonYears} years</div>

            {/* Allocation section */}
            <div className="col-span-2 mt-2.5 pt-2.5 border-t border-border-light">
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-widest">
                Allocation
              </span>
              <span className="ml-1.5 text-sm font-medium text-text-secondary">
                — {allocTypeName(state.allocation)}
              </span>
            </div>
            {aRows.map(([label, value]) => (
              <Fragment key={label}>
                <div className="text-text-muted">{label}</div>
                <div className="text-text font-medium">{value}</div>
              </Fragment>
            ))}

            {/* Withdrawal strategy section */}
            <div className="col-span-2 mt-2.5 pt-2.5 border-t border-border-light">
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-widest">
                Withdrawal
              </span>
              <span className="ml-1.5 text-sm font-medium text-text-secondary">
                — {wdTypeName(state.withdrawal)}
              </span>
            </div>
            {wRows.map(([label, value]) => (
              <Fragment key={label}>
                <div className="text-text-muted">{label}</div>
                <div className="text-text font-medium">{value}</div>
              </Fragment>
            ))}

            {/* Withdrawal source section */}
            <div className="col-span-2 mt-2.5 pt-2.5 border-t border-border-light">
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-widest">
                Source
              </span>
              <span className="ml-1.5 text-sm font-medium text-text-secondary">
                — {srcTypeName(state.withdrawalSource)}
              </span>
            </div>
            {sRows.map(([label, value]) => (
              <Fragment key={label}>
                <div className="text-text-muted">{label}</div>
                <div className="text-text font-medium">{value}</div>
              </Fragment>
            ))}

          </div>
        </div>

        {/* Name input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-base font-medium text-text-secondary">Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-border-input rounded-lg text-md text-text bg-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
            autoFocus
            placeholder="Name this strategy…"
          />
        </div>

        {postSaveAction && (
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none -mt-1">
            <input
              type="checkbox"
              checked={doPostAction}
              onChange={(e) => setDoPostAction(e.target.checked)}
              className="w-4 h-4 accent-secondary cursor-pointer"
            />
            {postSaveAction.label}
          </label>
        )}

        {showCloudNudge && (
          <div className="text-sm text-text-muted bg-surface-panel rounded-lg px-3 py-2">
            Saving to this device only.{' '}
            <button
              className="text-secondary font-medium hover:underline cursor-pointer bg-transparent border-none p-0"
              onClick={signInToSave}
            >
              Sign in
            </button>{' '}
            to save to your account and access it anywhere.
          </div>
        )}

        {err && <div className="text-sm text-error">{err}</div>}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="px-4 py-2 rounded-lg text-md font-medium text-text-secondary border border-border cursor-pointer hover:bg-surface-hover transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg text-md font-medium text-white bg-secondary cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : authed ? 'Save to account' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  );
}
