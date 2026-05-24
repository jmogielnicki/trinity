import { Fragment, useState } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useSweepStore } from '../store/sweepStore';
import { IconButton } from './ui/IconButton';
import {
  fmtMoney,
  describeAllocation, describeWithdrawal,
  allocTypeName, wdTypeName,
  allocRows, wdRows,
} from '../engine/strategyDescriptions';
import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';

function fmtBalance(n: number): string {
  if (n >= 1_000_000) return fmtMoney(n);
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function defaultName(a: AllocationStrategy, w: WithdrawalStrategy, horizon: number): string {
  return `${describeAllocation(a)} · ${describeWithdrawal(w)} · ${horizon}yr`;
}

export function SaveScenarioModal({ onClose }: { onClose: () => void }) {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const { save } = useLibraryStore();

  const [name, setName] = useState(() =>
    defaultName(scenario.allocation, scenario.withdrawal, scenario.horizonYears),
  );

  const onSave = () => {
    save(name, {
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: scenario.allocation,
      withdrawal: scenario.withdrawal,
      axes: sweep.axes,
      tailMethod: scenario.tailMethod,
      withdrawalSource: scenario.withdrawalSource,
    });
    onClose();
  };

  const aRows = allocRows(scenario.allocation);
  const wRows = wdRows(scenario.withdrawal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[420px] flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-text">Save scenario</h2>
          <IconButton onClick={onClose} aria-label="Close">✕</IconButton>
        </div>

        {/* Strategy summary */}
        <div className="bg-surface-panel rounded-lg p-3 text-base">
          <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 items-baseline">

            {/* Portfolio */}
            <div className="text-text-muted">Balance</div>
            <div className="text-text font-medium">{fmtBalance(scenario.initialBalance)}</div>
            <div className="text-text-muted">Horizon</div>
            <div className="text-text font-medium">{scenario.horizonYears} years</div>

            {/* Allocation section */}
            <div className="col-span-2 mt-2.5 pt-2.5 border-t border-border-light">
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-widest">
                Allocation
              </span>
              <span className="ml-1.5 text-sm font-medium text-text-secondary">
                — {allocTypeName(scenario.allocation)}
              </span>
            </div>
            {aRows.map(([label, value]) => (
              <Fragment key={label}>
                <div className="text-text-muted">{label}</div>
                <div className="text-text font-medium">{value}</div>
              </Fragment>
            ))}

            {/* Withdrawal section */}
            <div className="col-span-2 mt-2.5 pt-2.5 border-t border-border-light">
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-widest">
                Withdrawal
              </span>
              <span className="ml-1.5 text-sm font-medium text-text-secondary">
                — {wdTypeName(scenario.withdrawal)}
              </span>
            </div>
            {wRows.map(([label, value]) => (
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
            placeholder="Name this scenario…"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="px-4 py-2 rounded-lg text-md font-medium text-text-secondary border border-border cursor-pointer hover:bg-surface-hover transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg text-md font-medium text-white bg-secondary cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onSave}
          >
            Save
          </button>
        </div>

      </div>
    </div>
  );
}
