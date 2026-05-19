import {
  DEFAULT_WATERFALL_ORDER,
  type RefillRule,
  type WithdrawalSource,
} from '../../engine/withdrawalSource';
import type { Sleeve } from '../../engine/types';
import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';

const SLEEVE_LABELS: Record<Sleeve, string> = {
  cash: 'cash',
  bond: 'bonds',
  stock: 'stocks',
};

const SLEEVES: Sleeve[] = ['cash', 'bond', 'stock'];

const DEFAULT_REFILL_CHAIN: RefillRule[] = [
  {
    targetSleeve: 'bond',
    floor: 6,
    ceiling: 6,
    floorMode: 'withdrawalYears',
    sourceSleeve: 'stock',
    sourceReturnGate: 0,
  },
  {
    targetSleeve: 'cash',
    floor: 2,
    ceiling: 2,
    floorMode: 'withdrawalYears',
    sourceSleeve: 'bond',
  },
];

type Props = {
  /** Controlled value. Omit to bind to the single-scenario store. */
  value?: WithdrawalSource;
  onChange?: (s: WithdrawalSource) => void;
  /** Hide the "Withdrawal source" heading (for embedded use). */
  hideLabel?: boolean;
};

export function WithdrawalSourceInput({ value, onChange, hideLabel }: Props = {}) {
  const store = useScenarioStore();
  const withdrawalSource = value ?? store.withdrawalSource;
  const setWithdrawalSource = onChange ?? store.setWithdrawalSource;
  const mode = withdrawalSource.type;

  return (
    <div className="flex flex-col gap-2">
      {!hideLabel && <div className="text-sm text-text-secondary">Withdrawal source</div>}
      <div className="flex gap-0.5 bg-surface-muted rounded-lg p-[3px] overflow-x-auto scrollbar-none">
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${mode === 'proportional' ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() =>
            setWithdrawalSource({ type: 'proportional', rebalance: true })
          }
          title="Sell from each sleeve in proportion to its target weight; rebalance back to target each year."
        >
          proportional
        </button>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${mode === 'waterfall' ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() =>
            setWithdrawalSource({
              type: 'waterfall',
              order: DEFAULT_WATERFALL_ORDER,
            })
          }
          title="Drain sleeves in order until withdrawal is met. Sleeves drift; no auto-rebalance."
        >
          waterfall
        </button>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${mode === 'bucket' ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() =>
            setWithdrawalSource({
              type: 'bucket',
              order: DEFAULT_WATERFALL_ORDER,
              refill: DEFAULT_REFILL_CHAIN,
            })
          }
          title="Waterfall plus refill rules: replenish sleeves from growth when markets allow."
        >
          bucket
        </button>
      </div>

      {mode === 'proportional' && (
        <>
          <label className="flex items-center gap-1.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={
                (withdrawalSource as Extract<WithdrawalSource, { type: 'proportional' }>)
                  .rebalance
              }
              onChange={(e) =>
                setWithdrawalSource({
                  type: 'proportional',
                  rebalance: e.target.checked,
                })
              }
            />
            rebalance to target weights each year
          </label>
          <div className="text-xs text-text-faint py-[2px] pb-1">
            Sells proportionally; same outcome whether you check rebalance or
            not for static allocations.
          </div>
        </>
      )}

      {mode === 'waterfall' && (
        <>
          <WaterfallOrderEditor
            order={
              (withdrawalSource as Extract<WithdrawalSource, { type: 'waterfall' }>).order
            }
            onChange={(order) =>
              setWithdrawalSource({ type: 'waterfall', order })
            }
          />
          <div className="text-xs text-text-faint py-[2px] pb-1">
            Cash-bucket strategy: sleeves drift, downturns spend the safer
            ones first.
          </div>
        </>
      )}

      {mode === 'bucket' && (
        <BucketEditor
          source={withdrawalSource as Extract<WithdrawalSource, { type: 'bucket' }>}
          onChange={setWithdrawalSource}
        />
      )}
    </div>
  );
}

function WaterfallOrderEditor({
  order,
  onChange,
}: {
  order: Sleeve[];
  onChange: (o: Sleeve[]) => void;
}) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-text-faint py-[2px] pb-1">draw order:</div>
      <ol className="list-none p-0 m-0 flex flex-col gap-1">
        {order.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5 text-sm">
            <span className="flex-1">{i + 1}. {SLEEVE_LABELS[s]}</span>
            <button
              className="border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-text-body disabled:opacity-30 disabled:cursor-default"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              title="move earlier"
            >
              ↑
            </button>
            <button
              className="border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-text-body disabled:opacity-30 disabled:cursor-default"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
              title="move later"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BucketEditor({
  source,
  onChange,
}: {
  source: Extract<WithdrawalSource, { type: 'bucket' }>;
  onChange: (s: WithdrawalSource) => void;
}) {
  const update = (patch: Partial<Extract<WithdrawalSource, { type: 'bucket' }>>) =>
    onChange({ ...source, ...patch });

  const updateRule = (idx: number, patch: Partial<RefillRule>) => {
    const next = source.refill.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    update({ refill: next });
  };

  const removeRule = (idx: number) =>
    update({ refill: source.refill.filter((_, i) => i !== idx) });

  const addRule = () =>
    update({
      refill: [
        ...source.refill,
        {
          targetSleeve: 'cash' as Sleeve,
          floor: 0.08,
          ceiling: 0.15,
          floorMode: 'portfolioFraction' as const,
          sourceSleeve: 'bond' as Sleeve,
        },
      ],
    });

  return (
    <>
      <WaterfallOrderEditor
        order={source.order}
        onChange={(order) => update({ order })}
      />
      {source.refill.map((r, idx) => (
        <RefillRuleEditor
          key={idx}
          rule={r}
          index={idx}
          total={source.refill.length}
          onChange={(patch) => updateRule(idx, patch)}
          onRemove={() => removeRule(idx)}
        />
      ))}
      {source.refill.length < 3 && (
        <button className="border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-text-body" onClick={addRule} style={{ marginTop: 4 }}>
          + add refill rule
        </button>
      )}
      <div className="text-xs text-text-faint py-[2px] pb-1">
        Rules run in order after returns. Each rule only fires when its target
        sleeve is below its floor threshold.
      </div>
    </>
  );
}

function RefillRuleEditor({
  rule,
  index,
  total,
  onChange,
  onRemove,
}: {
  rule: RefillRule;
  index: number;
  total: number;
  onChange: (patch: Partial<RefillRule>) => void;
  onRemove: () => void;
}) {
  const mode = rule.floorMode ?? 'portfolioFraction';
  const isYears = mode === 'withdrawalYears';
  const hasReturnGate = rule.sourceReturnGate != null;
  const hasRatioGate = rule.sourceMinRatio != null;

  const axisNumCls = 'w-14 px-[6px] py-[3px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover';
  const selectCls = 'text-base px-1.5 py-1.5 border-[1.5px] border-border-input rounded-md font-[inherit] text-text bg-surface outline-none';

  return (
    <div className="flex flex-col gap-2 border border-border-light rounded px-2 py-1.5">
      <div className="text-sm text-text-secondary flex justify-between">
        <span>Refill rule {total > 1 ? index + 1 : ''}</span>
        {total > 1 && (
          <button className="border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-error" onClick={onRemove} title="remove rule">
            ✕
          </button>
        )}
      </div>

      {/* Floor mode toggle */}
      <div className="flex gap-0.5 bg-surface-muted rounded-lg p-[3px] overflow-x-auto scrollbar-none" style={{ marginBottom: 6 }}>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${!isYears ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => onChange({ floorMode: 'portfolioFraction' })}
          title="Express floor/ceiling as % of total portfolio"
        >
          % of portfolio
        </button>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${isYears ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => onChange({ floorMode: 'withdrawalYears' })}
          title="Express floor/ceiling as years of annual expenses"
        >
          years of expenses
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-base">
        <span>refill</span>
        <select
          className={selectCls}
          value={rule.targetSleeve}
          onChange={(e) => onChange({ targetSleeve: e.target.value as Sleeve })}
        >
          {SLEEVES.map((s) => (
            <option key={s} value={s}>
              {SLEEVE_LABELS[s]}
            </option>
          ))}
        </select>
        <span>when below</span>
        <NumericInput
          key={`floor-${isYears ? 'y' : 'f'}`}
          className={axisNumCls}
          value={rule.floor}
          format={isYears ? (v) => v.toFixed(1) : (v) => (v * 100).toFixed(1)}
          parse={isYears
            ? (s) => { const n = parseFloat(s); return isNaN(n) ? null : n; }
            : (s) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; }
          }
          min={0}
          max={isYears ? 30 : 1}
          onChange={(v) => onChange({ floor: v })}
        />
        <span>{isYears ? 'yrs, up to' : '%, up to'}</span>
        <NumericInput
          key={`ceiling-${isYears ? 'y' : 'f'}`}
          className={axisNumCls}
          value={rule.ceiling}
          format={isYears ? (v) => v.toFixed(1) : (v) => (v * 100).toFixed(1)}
          parse={isYears
            ? (s) => { const n = parseFloat(s); return isNaN(n) ? null : n; }
            : (s) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; }
          }
          min={0}
          max={isYears ? 30 : 1}
          onChange={(v) => onChange({ ceiling: v })}
        />
        <span>{isYears ? 'yrs' : '%'}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-base">
        <span>sell from</span>
        <select
          className={selectCls}
          value={rule.sourceSleeve}
          onChange={(e) => onChange({ sourceSleeve: e.target.value as Sleeve })}
        >
          {SLEEVES.map((s) => (
            <option key={s} value={s}>
              {SLEEVE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Return gate */}
      <label className="flex items-center gap-1.5 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={hasReturnGate}
          onChange={(e) =>
            onChange({ sourceReturnGate: e.target.checked ? 0 : undefined })
          }
        />
        only when source return &gt;
        <NumericInput
          className={axisNumCls}
          disabled={!hasReturnGate}
          value={rule.sourceReturnGate ?? 0}
          format={(v) => String(Math.round(v * 100))}
          parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; }}
          onChange={(v) => onChange({ sourceReturnGate: v })}
        />
        <span>% this year</span>
      </label>

      {/* Absolute-level gate */}
      <label className="flex items-center gap-1.5 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={hasRatioGate}
          onChange={(e) =>
            onChange({ sourceMinRatio: e.target.checked ? 1.0 : undefined })
          }
        />
        only when source ≥
        <NumericInput
          className={axisNumCls}
          disabled={!hasRatioGate}
          value={rule.sourceMinRatio ?? 1}
          format={(v) => String(Math.round(v * 100))}
          parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; }}
          onChange={(v) => onChange({ sourceMinRatio: v })}
        />
        <span>% of its initial value</span>
      </label>
    </div>
  );
}
