import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { StackedBar } from '../controls/StackedBar';
import {
  describeWithdrawal,
  describeAllocation,
  fmtMoney,
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
  horizonYears: number;
  initialBalance: number;
  isPreset?: boolean;
  description?: string;
  onToggle: () => void;
  onSave?: () => void;
};

/**
 * Turn an allocation strategy into the column weights the StackedBar draws.
 * Glide/rising strategies become two columns (start → end); everything with a
 * representative single mix becomes one. Custom JS strategies have no static
 * mix to show, so we return null and render a placeholder instead.
 */
function allocToBars(
  a: AllocationStrategy,
): { bars: Weights[]; labels?: string[] } | null {
  switch (a.type) {
    case 'static':
      return { bars: [a.weights] };
    case 'glidepath':
      return { bars: [a.start, a.end], labels: ['yr 0', `yr ${a.transitionYears}`] };
    case 'risingEquity':
      return { bars: [a.start, a.end], labels: ['yr 0', `yr ${a.years}`] };
    case 'linearDrift':
      return { bars: [a.start] };
    case 'ruleBased':
      return { bars: [a.base] };
    case 'ageInBonds': {
      const bond = Math.max(0, Math.min(1, a.currentAge / 100));
      return { bars: [{ stock: 1 - bond, bond, cash: 0 }] };
    }
    case 'custom':
    case 'customSrc':
      return null;
  }
}

export function ScenarioCard({
  name,
  color,
  selected,
  disabled,
  allocation,
  withdrawal,
  horizonYears,
  initialBalance,
  isPreset,
  description,
  onToggle,
  onSave,
}: Props) {
  const alloc = allocToBars(allocation);

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
      className={`group flex flex-col gap-2 rounded-lg border-2 p-2.5 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50 border-border-light bg-surface-page'
          : 'cursor-pointer bg-surface-page hover:bg-surface-hover'
      } ${selected ? '' : 'border-border-light'}`}
      style={selected && color ? { borderColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm text-text truncate">{name}</div>
          <div className="text-xs text-text-faint truncate">
            {describeWithdrawal(withdrawal)} · {horizonYears}y · {fmtMoney(initialBalance)}
          </div>
        </div>
        <span
          className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] leading-none text-white"
          style={
            selected && color
              ? { background: color, borderColor: color }
              : { borderColor: 'var(--color-text-disabled)' }
          }
        >
          {selected ? '✓' : ''}
        </span>
      </div>

      <div className="flex justify-center">
        {alloc ? (
          <StackedBar
            weights={alloc.bars}
            columnLabels={alloc.labels}
            onChange={() => {}}
            interactive={false}
            width={alloc.bars.length > 1 ? 200 : 130}
            height={84}
          />
        ) : (
          <div className="w-[130px] h-[84px] rounded-sm bg-surface-hover border border-border-light flex items-center justify-center text-xs text-text-faint">
            custom mix
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
        <span className="truncate">{describeAllocation(allocation)}</span>
        {isPreset && onSave && (
          <button
            className="flex-shrink-0 px-1.5 py-[2px] border border-text-disabled rounded-[3px] text-2xs text-text-secondary hover:bg-surface-hover"
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}
