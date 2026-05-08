import {
  DEFAULT_WATERFALL_ORDER,
  type WithdrawalSource,
} from '../../engine/withdrawalSource';
import type { Sleeve } from '../../engine/types';
import { useScenarioStore } from '../../store/scenarioStore';

const SLEEVE_LABELS: Record<Sleeve, string> = {
  cash: 'cash',
  bond: 'bonds',
  stock: 'stocks',
};

export function WithdrawalSourceInput() {
  const { withdrawalSource, setWithdrawalSource } = useScenarioStore();
  const isWaterfall = withdrawalSource.type === 'waterfall';

  const setProportional = (rebalance: boolean) =>
    setWithdrawalSource({ type: 'proportional', rebalance });
  const setWaterfall = (order: Sleeve[]) =>
    setWithdrawalSource({ type: 'waterfall', order });

  return (
    <div className="control-group">
      <div className="control-label">Withdrawal source</div>
      <div className="mode-toggle">
        <button
          className={!isWaterfall ? 'active' : ''}
          onClick={() => setProportional(true)}
          title="Sell from each sleeve in proportion to its target weight; rebalance back to target each year."
        >
          proportional
        </button>
        <button
          className={isWaterfall ? 'active' : ''}
          onClick={() => setWaterfall(DEFAULT_WATERFALL_ORDER)}
          title="Drain sleeves in order until withdrawal is met. Sleeves drift; no auto-rebalance."
        >
          waterfall
        </button>
      </div>

      {!isWaterfall && (
        <label className="rebalance-row">
          <input
            type="checkbox"
            checked={(withdrawalSource as Extract<WithdrawalSource, { type: 'proportional' }>).rebalance}
            onChange={(e) => setProportional(e.target.checked)}
          />
          rebalance to target weights each year
        </label>
      )}

      {isWaterfall && (
        <WaterfallOrderEditor
          order={(withdrawalSource as Extract<WithdrawalSource, { type: 'waterfall' }>).order}
          onChange={setWaterfall}
        />
      )}

      <div className="rule-hint">
        {isWaterfall
          ? 'Cash-bucket strategy: sleeves drift, downturns spend the safer ones first.'
          : 'Sells proportionally; same outcome whether you check rebalance or not for static allocations.'}
      </div>
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
