import type { TailMethod } from '../../engine/sweep';
import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';

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
    <div className="control-group">
      <div className="control-label">
        Recent retirees (data runs out before horizon)
      </div>
      <div className="mode-toggle">
        <button
          className={!isBootstrap ? 'active' : ''}
          onClick={() => setTailMethod({ type: 'truncate' })}
          title="Run only as far as data permits; mark as in-progress"
        >
          truncate
        </button>
        <button
          className={isBootstrap ? 'active' : ''}
          onClick={() => setTailMethod(DEFAULT_BOOTSTRAP)}
          title="Sample contiguous historical blocks to fill the unknown tail"
        >
          bootstrap
        </button>
      </div>
      {isBootstrap && (
        <div className="bootstrap-cfg">
          <label>
            block (yrs){' '}
            <NumericInput
              className="axis-num"
              value={tailMethod.blockYears}
              format={fmtInt}
              parse={parseIntFn}
              min={1}
              max={20}
              onChange={(v) => setTailMethod({ ...tailMethod, blockYears: v })}
            />
          </label>
          <label>
            samples{' '}
            <NumericInput
              className="axis-num"
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
