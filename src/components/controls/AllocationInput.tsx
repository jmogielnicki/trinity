import { useScenarioStore } from '../../store/scenarioStore';

export function AllocationInput() {
  const { weights, setWeights } = useScenarioStore();

  const update = (k: 'stock' | 'bond' | 'cash', v: number) => {
    const next = { ...weights, [k]: v };
    const sum = next.stock + next.bond + next.cash;
    if (sum > 0) {
      setWeights({
        stock: next.stock / sum,
        bond: next.bond / sum,
        cash: next.cash / sum,
      });
    }
  };

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="control-group">
      <div className="alloc-bar">
        <div className="seg seg-stock" style={{ width: pct(weights.stock) }}>
          stocks {pct(weights.stock)}
        </div>
        <div className="seg seg-bond" style={{ width: pct(weights.bond) }}>
          bonds {pct(weights.bond)}
        </div>
        <div className="seg seg-cash" style={{ width: pct(weights.cash) }}>
          cash {pct(weights.cash)}
        </div>
      </div>
      <label>
        stocks
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={weights.stock}
          onChange={(e) => update('stock', Number(e.target.value))}
        />
      </label>
      <label>
        bonds
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={weights.bond}
          onChange={(e) => update('bond', Number(e.target.value))}
        />
      </label>
    </div>
  );
}
