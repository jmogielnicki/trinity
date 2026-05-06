import { useScenarioStore } from '../../store/scenarioStore';

export function WithdrawalInput() {
  const { withdrawalRate, setWithdrawalRate } = useScenarioStore();
  return (
    <div className="control-group">
      <label>
        Withdrawal rate (% of initial, inflation-adjusted)
        <input
          type="range"
          min={1}
          max={10}
          step={0.1}
          value={withdrawalRate * 100}
          onChange={(e) => setWithdrawalRate(Number(e.target.value) / 100)}
        />
        <span>{(withdrawalRate * 100).toFixed(1)}%</span>
      </label>
    </div>
  );
}
