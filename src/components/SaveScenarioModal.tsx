import { useState } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useSweepStore } from '../store/sweepStore';
import { IconButton } from './ui/IconButton';
import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';

function allocLabel(a: AllocationStrategy): string {
  if (a.type === 'static') {
    const s = Math.round(a.weights.stock * 100);
    const b = Math.round(a.weights.bond * 100);
    return `${s}/${b} stocks/bonds`;
  }
  if (a.type === 'glidepath') {
    const s0 = Math.round(a.start.stock * 100);
    const s1 = Math.round(a.end.stock * 100);
    return `${s0}→${s1}% stocks glide`;
  }
  if (a.type === 'ageInBonds') return 'age-in-bonds';
  if (a.type === 'risingEquity') {
    const s0 = Math.round(a.start.stock * 100);
    const s1 = Math.round(a.end.stock * 100);
    return `${s0}→${s1}% rising equity`;
  }
  return a.type;
}

function wdLabel(w: WithdrawalStrategy): string {
  if (w.type === 'fixedPercent') return `${(w.rate * 100).toFixed(1)}% fixed`;
  if (w.type === 'fixedDollar') return `$${w.amount.toLocaleString()}/yr`;
  if (w.type === 'percentOfBalance') return `${(w.rate * 100).toFixed(1)}% of balance`;
  if (w.type === 'floorAndUpside') return `floor+upside`;
  if (w.type === 'guardrails') return `guardrails`;
  if (w.type === 'piecewise' || w.type === 'piecewiseLinear') return 'piecewise';
  if (w.type === 'capeWithdrawal') return 'CAPE-based';
  if (w.type === 'ratchet') return `${(w.baseRate * 100).toFixed(1)}% ratchet`;
  if (w.type === 'endowment') return `${(w.rate * 100).toFixed(1)}% endowment`;
  if (w.type === 'vanguardDynamic') return `${(w.rate * 100).toFixed(1)}% dynamic`;
  return w.type;
}

function fmtBalance(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function defaultName(
  alloc: AllocationStrategy,
  wd: WithdrawalStrategy,
  horizon: number,
): string {
  return `${allocLabel(alloc)} · ${wdLabel(wd)} · ${horizon}yr`;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[420px] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-text">Save scenario</h2>
          <IconButton onClick={onClose} aria-label="Close">✕</IconButton>
        </div>

        {/* Strategy summary */}
        <div className="bg-surface-panel rounded-lg p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-base">
          <div className="text-text-muted">Balance</div>
          <div className="text-text font-medium">{fmtBalance(scenario.initialBalance)}</div>
          <div className="text-text-muted">Horizon</div>
          <div className="text-text font-medium">{scenario.horizonYears} years</div>
          <div className="text-text-muted">Allocation</div>
          <div className="text-text font-medium">{allocLabel(scenario.allocation)}</div>
          <div className="text-text-muted">Withdrawal</div>
          <div className="text-text font-medium">{wdLabel(scenario.withdrawal)}</div>
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
