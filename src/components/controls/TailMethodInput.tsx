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
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">
        Recent retirees (data runs out before horizon)
      </div>
      <div className="flex gap-0.5 bg-surface-muted rounded-lg p-[3px] overflow-x-auto scrollbar-none">
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${!isBootstrap ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => setTailMethod({ type: 'truncate' })}
          title="Run only as far as data permits; mark as in-progress"
        >
          truncate
        </button>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${isBootstrap ? ' bg-surface text-text shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => setTailMethod(DEFAULT_BOOTSTRAP)}
          title="Sample contiguous historical blocks to fill the unknown tail"
        >
          bootstrap
        </button>
      </div>
      {isBootstrap && (
        <div className="flex gap-3 items-center text-xs text-text-secondary">
          <label className="flex items-center gap-1">
            block (yrs){' '}
            <NumericInput
              className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
              className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
