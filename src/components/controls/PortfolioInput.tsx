import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';

export function PortfolioInput() {
  const { initialBalance, horizonYears, setBalance, setHorizon } =
    useScenarioStore();
  return (
    <div className="flex flex-row gap-4 items-end">
      <label className="flex flex-col gap-1 text-sm text-text-secondary font-medium">
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
      <label className="flex flex-col gap-1 text-sm text-text-secondary font-medium">
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
