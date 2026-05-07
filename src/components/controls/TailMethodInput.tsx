import type { TailMethod } from '../../engine/sweep';
import { useScenarioStore } from '../../store/scenarioStore';

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
            <input
              type="number"
              className="axis-num"
              min={1}
              max={20}
              value={tailMethod.blockYears}
              onChange={(e) =>
                setTailMethod({ ...tailMethod, blockYears: +e.target.value })
              }
            />
          </label>
          <label>
            samples{' '}
            <input
              type="number"
              className="axis-num"
              min={10}
              max={500}
              step={10}
              value={tailMethod.samplesPerPrefix}
              onChange={(e) =>
                setTailMethod({
                  ...tailMethod,
                  samplesPerPrefix: +e.target.value,
                })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
