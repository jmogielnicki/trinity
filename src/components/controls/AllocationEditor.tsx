import type { AllocationStrategy } from '../../engine/strategies';
import { AllocationRuleBuilder } from './AllocationRuleBuilder';
import { CustomScriptEditor } from './CustomScriptEditor';
import { GlidePath } from './GlidePath';

type Mode = 'glide' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
};

function modeOf(a: AllocationStrategy): Mode {
  if (a.type === 'ruleBased') return 'rules';
  if (a.type === 'customSrc' || a.type === 'custom') return 'script';
  return 'glide';
}

const DEFAULT_SCRIPT = `// per-year allocation as { stock, bond, cash }
// state.t = year index, state.balance = current $
// Returns are normalized to 1.
return { stock: 0.6, bond: 0.4, cash: 0 };`;

export function AllocationEditor({ horizonYears, allocation, onChange }: Props) {
  const mode = modeOf(allocation);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'glide')
      onChange({
        type: 'static',
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
      });
    if (m === 'rules')
      onChange({
        type: 'ruleBased',
        base: { stock: 0.6, bond: 0.4, cash: 0 },
        rules: [
          {
            if: { type: 'balanceVsInitial', ratio: 1, comparator: '<' },
            then: {
              type: 'shiftAllocation',
              delta: { stock: -0.1, bond: 0.1, cash: 0 },
            },
          },
        ],
      });
    if (m === 'script') onChange({ type: 'customSrc', src: DEFAULT_SCRIPT });
  };

  return (
    <div className="editor-block">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'glide' && (
        <GlidePath
          horizonYears={horizonYears}
          allocation={allocation}
          onChange={onChange}
        />
      )}
      {mode === 'rules' && allocation.type === 'ruleBased' && (
        <AllocationRuleBuilder
          base={allocation.base}
          rules={allocation.rules}
          onChange={(base, rules) =>
            onChange({ type: 'ruleBased', base, rules })
          }
        />
      )}
      {mode === 'script' && (
        <CustomScriptEditor
          label="Allocation script — return { stock, bond, cash }."
          signature="state"
          initial={
            allocation.type === 'customSrc' ? allocation.src : DEFAULT_SCRIPT
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
    { k: 'glide', label: 'glide' },
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
