import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';

export function PortfolioInput() {
  const { initialBalance, horizonYears, setBalance, setHorizon } =
    useScenarioStore();
  return (
    <div className="control-group">
      <label>
        Initial balance ($, real)
        <NumericInput
          value={initialBalance}
          onChange={setBalance}
          min={0}
          parse={(s) => {
            if (s.trim() === '') return null;
            const n = parseFloat(s.replace(/,/g, ''));
            return isNaN(n) ? null : n;
          }}
        />
      </label>
      <label>
        Horizon (years)
        <NumericInput
          value={horizonYears}
          onChange={(v) => setHorizon(Math.round(v))}
          min={1}
          max={80}
          parse={(s) => {
            if (s.trim() === '') return null;
            const n = parseInt(s, 10);
            return isNaN(n) ? null : n;
          }}
        />
      </label>
    </div>
  );
}
