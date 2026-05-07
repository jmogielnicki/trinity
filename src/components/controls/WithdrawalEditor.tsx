import type { WithdrawalStrategy } from '../../engine/strategies';
import { CustomScriptEditor } from './CustomScriptEditor';
import { RuleBuilder } from './RuleBuilder';
import { WithdrawalCurve } from './WithdrawalCurve';

type Mode = 'curve' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  withdrawal: WithdrawalStrategy;
  onChange: (w: WithdrawalStrategy) => void;
};

function modeOf(w: WithdrawalStrategy): Mode {
  if (w.type === 'ruleBased') return 'rules';
  if (w.type === 'customSrc' || w.type === 'custom') return 'script';
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
