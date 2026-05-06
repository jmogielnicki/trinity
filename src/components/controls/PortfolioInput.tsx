import { useScenarioStore } from '../../store/scenarioStore';

export function PortfolioInput() {
  const { initialBalance, horizonYears, setBalance, setHorizon } =
    useScenarioStore();
  return (
    <div className="control-group">
      <label>
        Initial balance ($, real)
        <input
          type="number"
          min={1000}
          step={10000}
          value={initialBalance}
          onChange={(e) => setBalance(Number(e.target.value))}
        />
      </label>
      <label>
        Horizon (years)
        <input
          type="number"
          min={1}
          max={80}
          value={horizonYears}
          onChange={(e) => setHorizon(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
