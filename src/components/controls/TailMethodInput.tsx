import type { TailMethod } from '../../engine/sweep';
import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';
import { FIELD_SM } from '../ui/fieldCls';

const fmtInt = (v: number) => String(Math.round(v));
const parseIntFn = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; };

const DEFAULT_BOOTSTRAP: Extract<TailMethod, { type: 'bootstrap' }> = {
  type: 'bootstrap',
  blockYears: 7,
  samplesPerPrefix: 200,
};

export function TailMethodInput() {
  const { tailMethod, setTailMethod } = useScenarioStore();
  const isBootstrap = tailMethod.type === 'bootstrap';

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">
        Recent retirees (data runs out before horizon)
      </div>
      <TabBar>
        <ToggleButton
          active={!isBootstrap}
          onClick={() => setTailMethod({ type: 'truncate' })}
        >
          truncate
        </ToggleButton>
        <ToggleButton
          active={isBootstrap}
          onClick={() => setTailMethod(DEFAULT_BOOTSTRAP)}
        >
          bootstrap
        </ToggleButton>
      </TabBar>
      {isBootstrap && (
        <div className="flex gap-3 items-center text-xs text-text-secondary">
          <label className="flex items-center gap-1">
            block (yrs){' '}
            <NumericInput
              className={FIELD_SM}
              value={tailMethod.blockYears}
              format={fmtInt}
              parse={parseIntFn}
              min={1}
              max={20}
              onChange={(v) => setTailMethod({ ...tailMethod, blockYears: v })}
            />
          </label>
          <label className="flex items-center gap-1">
            samples{' '}
            <NumericInput
              className={FIELD_SM}
              value={tailMethod.samplesPerPrefix}
              format={fmtInt}
              parse={parseIntFn}
              min={10}
              max={500}
              onChange={(v) => setTailMethod({ ...tailMethod, samplesPerPrefix: v })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
