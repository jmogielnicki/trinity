import { Fragment } from 'react';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { WithdrawalSource } from '../../engine/withdrawalSource';
import {
  allocTypeName,
  wdTypeName,
  srcTypeName,
  allocRows,
  wdRows,
  srcRows,
} from '../../engine/strategyDescriptions';

type Props = {
  name: string;
  /** Series color, shown when the card is selected. */
  color?: string;
  selected: boolean;
  /** Selection cap reached and this card isn't already selected. */
  disabled: boolean;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  withdrawalSource?: WithdrawalSource;
  isPreset?: boolean;
  description?: string;
  onToggle: () => void;
  onSave?: () => void;
  onDelete?: () => void;
};

function Section({
  label,
  type,
  rows,
}: {
  label: string;
  type: string;
  rows: [string, string][];
}) {
  return (
    <>
      <div className="col-span-2 mt-1.5 first:mt-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span className="ml-1 text-2xs text-text-secondary">— {type}</span>
      </div>
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <div className="text-text-muted">{k}</div>
          <div className="text-text font-medium truncate">{v}</div>
        </Fragment>
      ))}
    </>
  );
}

export function ScenarioCard({
  name,
  color,
  selected,
  disabled,
  allocation,
  withdrawal,
  withdrawalSource,
  isPreset,
  description,
  onToggle,
  onSave,
  onDelete,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      title={description}
      onClick={() => !disabled && onToggle()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group flex flex-col gap-1.5 rounded-lg border-2 p-2.5 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50 border-border-light bg-surface-page'
          : 'cursor-pointer bg-surface-page hover:bg-surface-hover'
      } ${selected ? '' : 'border-border-light'}`}
      style={selected && color ? { borderColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="font-medium text-sm text-text leading-tight min-w-0 truncate">
          {name}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPreset && onSave && (
            <button
              className="px-1.5 py-[2px] border border-text-disabled rounded-[3px] text-2xs text-text-secondary hover:bg-surface-hover"
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
            >
              Save
            </button>
          )}
          {!isPreset && onDelete && (
            <button
              aria-label="Delete scenario"
              title="Delete scenario"
              className="w-5 h-5 flex items-center justify-center rounded-[3px] text-text-faint hover:text-error hover:bg-surface-hover"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 5v6m4-6v6" />
              </svg>
            </button>
          )}
          <span
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] leading-none text-white"
            style={
              selected && color
                ? { background: color, borderColor: color }
                : { borderColor: 'var(--color-text-disabled)' }
            }
          >
            {selected ? '✓' : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-px text-2xs items-baseline">
        <Section label="Allocation" type={allocTypeName(allocation)} rows={allocRows(allocation)} />
        <Section label="Withdrawal" type={wdTypeName(withdrawal)} rows={wdRows(withdrawal)} />
        <Section label="Source" type={srcTypeName(withdrawalSource)} rows={srcRows(withdrawalSource)} />
      </div>
    </div>
  );
}
