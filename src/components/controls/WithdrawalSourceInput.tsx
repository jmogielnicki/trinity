import {
  DEFAULT_WATERFALL_ORDER,
  type RefillRule,
  type WithdrawalSource,
} from '../../engine/withdrawalSource';
import type { Sleeve } from '../../engine/types';
import { useScenarioStore } from '../../store/scenarioStore';

const SLEEVE_LABELS: Record<Sleeve, string> = {
  cash: 'cash',
  bond: 'bonds',
  stock: 'stocks',
};

const SLEEVES: Sleeve[] = ['cash', 'bond', 'stock'];

const DEFAULT_REFILL: RefillRule = {
  targetSleeve: 'cash',
  floor: 0.08,
  ceiling: 0.15,
  sourceSleeve: 'bond',
  sourceMinRatio: undefined,
};

const DEFAULT_REFILL_CHAIN: RefillRule[] = [
  DEFAULT_REFILL,
  {
    targetSleeve: 'bond',
    floor: 0.25,
    ceiling: 0.35,
    sourceSleeve: 'stock',
    sourceMinRatio: 1.0,
  },
];

export function WithdrawalSourceInput() {
  const { withdrawalSource, setWithdrawalSource } = useScenarioStore();
  const mode = withdrawalSource.type;

  return (
    <div className="control-group">
      <div className="control-label">Withdrawal source</div>
      <div className="mode-toggle">
        <button
          className={mode === 'proportional' ? 'active' : ''}
          onClick={() =>
            setWithdrawalSource({ type: 'proportional', rebalance: true })
          }
          title="Sell from each sleeve in proportion to its target weight; rebalance back to target each year."
        >
          proportional
        </button>
        <button
          className={mode === 'waterfall' ? 'active' : ''}
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
          className={mode === 'bucket' ? 'active' : ''}
          onClick={() =>
            setWithdrawalSource({
              type: 'bucket',
              order: DEFAULT_WATERFALL_ORDER,
              refill: DEFAULT_REFILL_CHAIN,
            })
          }
          title="Waterfall plus refill rules: top up cash from bonds, top up bonds from stocks when stocks are doing well."
        >
          bucket
        </button>
      </div>

      {mode === 'proportional' && (
        <>
          <label className="rebalance-row">
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
          <div className="rule-hint">
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
          <div className="rule-hint">
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
    <div className="waterfall-order">
      <div className="rule-hint">draw order:</div>
      <ol>
        {order.map((s, i) => (
          <li key={s}>
            <span>{i + 1}. {SLEEVE_LABELS[s]}</span>
            <button
              className="x-btn"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              title="move earlier"
            >
              ↑
            </button>
            <button
              className="x-btn"
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
    update({ refill: [...source.refill, { ...DEFAULT_REFILL }] });

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
        <button className="x-btn" onClick={addRule} style={{ marginTop: 4 }}>
          + add refill rule
        </button>
      )}
      <div className="rule-hint">
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
  const hasGate = rule.sourceMinRatio != null;
  return (
    <div className="bucket-refill">
      <div className="control-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Refill rule {total > 1 ? index + 1 : ''}</span>
        {total > 1 && (
          <button className="x-btn" onClick={onRemove} title="remove rule">
            ✕
          </button>
        )}
      </div>
      <div className="rule-line">
        <span>refill</span>
        <select
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
        <input
          type="number"
          className="axis-num"
          step={1}
          min={0}
          max={100}
          value={(rule.floor * 100).toFixed(1)}
          onChange={(e) => onChange({ floor: +e.target.value / 100 })}
        />
        <span>%, up to</span>
        <input
          type="number"
          className="axis-num"
          step={1}
          min={0}
          max={100}
          value={(rule.ceiling * 100).toFixed(1)}
          onChange={(e) => onChange({ ceiling: +e.target.value / 100 })}
        />
        <span>%</span>
      </div>
      <div className="rule-line">
        <span>sell from</span>
        <select
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
      <label className="rebalance-row">
        <input
          type="checkbox"
          checked={hasGate}
          onChange={(e) =>
            onChange({ sourceMinRatio: e.target.checked ? 1.0 : undefined })
          }
        />
        only when source ≥
        <input
          type="number"
          className="axis-num"
          disabled={!hasGate}
          step={5}
          value={hasGate ? Math.round((rule.sourceMinRatio ?? 1) * 100) : 100}
          onChange={(e) => onChange({ sourceMinRatio: +e.target.value / 100 })}
        />
        <span>% of its initial value</span>
      </label>
    </div>
  );
}
