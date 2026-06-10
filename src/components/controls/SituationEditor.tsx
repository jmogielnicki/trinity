import { useScenarioStore } from '../../store/scenarioStore';
import { StepSlider } from '../ui/StepSlider';
import { IncomeInput } from './IncomeInput';
import { NumericInput } from './NumericInput';
import { fmtThousands, parseThousands } from './situationSummary';

/**
 * "Your situation" — the personal circumstances every plan runs under:
 * balance, retirement length, and external income & one-time events.
 * Container-agnostic body shared by the desktop popover and mobile sheet.
 */
export function SituationEditor() {
  const { initialBalance, horizonYears, retireAge, setBalance, setHorizon } =
    useScenarioStore();

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-text-secondary font-medium">
        Initial balance ($, today&apos;s dollars)
        <NumericInput
          value={initialBalance}
          onChange={setBalance}
          min={0}
          format={fmtThousands}
          parse={parseThousands}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm text-text-secondary font-medium">
        <span>
          Retirement length (years)
          {retireAge != null && (
            <span className="text-text-faint font-normal">
              {' '}
              — age {retireAge} → {retireAge + horizonYears}
            </span>
          )}
        </span>
        <StepSlider
          value={horizonYears}
          onChange={setHorizon}
          min={20}
          max={60}
          step={5}
          format={(v) => String(v)}
          labelPosition="above-thumb"
        />
      </div>

      <div className="border-t border-border pt-4">
        <IncomeInput />
      </div>
    </div>
  );
}
