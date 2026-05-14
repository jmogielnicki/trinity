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
  sourceSleeve: 'stock',
  sourceMinRatio: 1.0,
};

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
              refill: DEFAULT_REFILL,
            })
          }
          title="Waterfall plus a refill rule: top up cash from stocks when cash runs low and stocks are doing well."
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
  const updateRefill = (patch: Partial<RefillRule>) =>
    onChange({ ...source, refill: { ...source.refill, ...patch } });
  const r = source.refill;
  const hasGate = r.sourceMinRatio != null;

  return (
    <>
      <WaterfallOrderEditor
        order={source.order}
        onChange={(order) => update({ order })}
      />
      <div className="bucket-refill">
        <div className="control-label">Refill rule</div>
        <div className="rule-line">
          <span>refill</span>
          <select
            value={r.targetSleeve}
            onChange={(e) =>
              updateRefill({ targetSleeve: e.target.value as Sleeve })
            }
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
            value={(r.floor * 100).toFixed(1)}
            onChange={(e) => updateRefill({ floor: +e.target.value / 100 })}
          />
          <span>%, up to</span>
          <input
            type="number"
            className="axis-num"
            step={1}
            min={0}
            max={100}
            value={(r.ceiling * 100).toFixed(1)}
            onChange={(e) => updateRefill({ ceiling: +e.target.value / 100 })}
          />
          <span>%</span>
        </div>
        <div className="rule-line">
          <span>sell from</span>
          <select
            value={r.sourceSleeve}
            onChange={(e) =>
              updateRefill({ sourceSleeve: e.target.value as Sleeve })
            }
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
              updateRefill({ sourceMinRatio: e.target.checked ? 1.0 : undefined })
            }
          />
          only when source ≥
          <input
            type="number"
            className="axis-num"
            disabled={!hasGate}
            step={5}
            value={hasGate ? Math.round((r.sourceMinRatio ?? 1) * 100) : 100}
            onChange={(e) => updateRefill({ sourceMinRatio: +e.target.value / 100 })}
          />
          <span>% of its initial value</span>
        </label>
        <div className="rule-hint">
          Draws from cash first; when cash drops below the floor and (if gated)
          the source is doing well, sells from the source to bring cash back
          up to the ceiling.
        </div>
      </div>
    </>
  );
}
