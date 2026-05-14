import type { WithdrawalStrategy } from '../../engine/strategies';
import { CustomScriptEditor } from './CustomScriptEditor';
import { RuleBuilder } from './RuleBuilder';
import { WithdrawalCurve } from './WithdrawalCurve';

type Mode = 'curve' | 'floor-upside' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  withdrawal: WithdrawalStrategy;
  onChange: (w: WithdrawalStrategy) => void;
};

function modeOf(w: WithdrawalStrategy): Mode {
  if (w.type === 'ruleBased') return 'rules';
  if (w.type === 'customSrc' || w.type === 'custom') return 'script';
  if (w.type === 'floorAndUpside') return 'floor-upside';
  // 'curve' covers fixedPercent, piecewiseLinear (what the editor emits),
  // and the legacy 'piecewise' (kept as a separate engine type so old
  // saved scenarios still resolve).
  return 'curve';
}

const DEFAULT_SCRIPT = `// real-dollar withdrawal each year
// state.t = year index, state.balance = current $
// initial = starting balance
return 0.04 * initial;`;

export function WithdrawalEditor({ horizonYears, withdrawal, onChange }: Props) {
  const mode = modeOf(withdrawal);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'curve') onChange({ type: 'fixedPercent', rate: 0.04 });
    if (m === 'rules')
      onChange({
        type: 'ruleBased',
        base: 0.04,
        rules: [
          {
            if: { type: 'yearRange', from: 0, to: 5 },
            then: { type: 'setWithdrawal', rate: 0.035 },
          },
        ],
      });
    if (m === 'script') onChange({ type: 'customSrc', src: DEFAULT_SCRIPT });
    if (m === 'floor-upside')
      onChange({
        type: 'floorAndUpside',
        floor: 0.04,
        gainStep: 0.1,
        bumpPerStep: 0.3,
      });
  };

  return (
    <div className="editor-block">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'curve' && (
        <WithdrawalCurve
          horizonYears={horizonYears}
          withdrawal={withdrawal}
          onChange={onChange}
        />
      )}
      {mode === 'floor-upside' && withdrawal.type === 'floorAndUpside' && (
        <FloorUpsideEditor
          floor={withdrawal.floor}
          gainStep={withdrawal.gainStep}
          bumpPerStep={withdrawal.bumpPerStep}
          onChange={(floor, gainStep, bumpPerStep) =>
            onChange({ type: 'floorAndUpside', floor, gainStep, bumpPerStep })
          }
        />
      )}
      {mode === 'rules' && withdrawal.type === 'ruleBased' && (
        <RuleBuilder
          base={withdrawal.base}
          rules={withdrawal.rules}
          onChange={(base, rules) => onChange({ type: 'ruleBased', base, rules })}
        />
      )}
      {mode === 'script' && (
        <CustomScriptEditor
          label="Withdrawal script — return real $ to withdraw."
          signature="state, initial"
          initial={
            withdrawal.type === 'customSrc' ? withdrawal.src : DEFAULT_SCRIPT
          }
          onChange={(src) => onChange({ type: 'customSrc', src })}
        />
      )}
    </div>
  );
}

function ModeToggle({
  current,
  onChange,
}: {
  current: Mode;
  onChange: (m: Mode) => void;
}) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'curve', label: 'curve' },
    { k: 'floor-upside', label: 'floor + upside' },
    { k: 'rules', label: 'rules' },
    { k: 'script', label: 'script' },
  ];
  return (
    <div className="mode-toggle">
      {modes.map((m) => (
        <button
          key={m.k}
          className={current === m.k ? 'active' : ''}
          onClick={() => onChange(m.k)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function FloorUpsideEditor({
  floor,
  gainStep,
  bumpPerStep,
  onChange,
}: {
  floor: number;
  gainStep: number;
  bumpPerStep: number;
  onChange: (floor: number, gainStep: number, bumpPerStep: number) => void;
}) {
  return (
    <div className="floor-upside-editor">
      <div className="floor-upside-hint">
        Withdraw at least <strong>floor %</strong> of initial each year. For
        every <strong>gain step</strong> the balance rises above initial,
        increase withdrawal by <strong>bump</strong>.
      </div>
      <div className="floor-upside-grid">
        <label>
          Floor (% of initial)
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={(floor * 100).toFixed(2).replace(/\.?0+$/, '')}
            onChange={(e) =>
              onChange(
                Math.max(0, parseFloat(e.target.value) / 100 || 0),
                gainStep,
                bumpPerStep,
              )
            }
          />
        </label>
        <label>
          Bump per gain-step (% wd ↑)
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={(bumpPerStep * 100).toFixed(2).replace(/\.?0+$/, '')}
            onChange={(e) =>
              onChange(
                floor,
                gainStep,
                Math.max(0, parseFloat(e.target.value) / 100 || 0),
              )
            }
          />
        </label>
        <label>
          Gain step (% balance ↑ over initial)
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={(gainStep * 100).toFixed(2).replace(/\.?0+$/, '')}
            onChange={(e) =>
              onChange(
                floor,
                Math.max(0.001, parseFloat(e.target.value) / 100 || 0.1),
                bumpPerStep,
              )
            }
          />
        </label>
      </div>
    </div>
  );
}
