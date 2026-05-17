import { useState } from 'react';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { AllocationRuleBuilder } from './AllocationRuleBuilder';
import { CustomScriptEditor } from './CustomScriptEditor';
import { GlidePath } from './GlidePath';

type Mode = 'fixed' | 'glide' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
};

function modeOf(a: AllocationStrategy): Mode {
  if (a.type === 'ruleBased') return 'rules';
  if (a.type === 'customSrc' || a.type === 'custom') return 'script';
  if (a.type === 'glidepath') return 'glide';
  return 'fixed';
}

function weightsOf(a: AllocationStrategy): Weights {
  if (a.type === 'static') return a.weights;
  if (a.type === 'glidepath') return a.start;
  return { stock: 0.6, bond: 0.4, cash: 0 };
}

const DEFAULT_SCRIPT = `// per-year allocation as { stock, bond, cash }
// state.t = year index, state.balance = current $
// Returns are normalized to 1.
return { stock: 0.6, bond: 0.4, cash: 0 };`;

export function AllocationEditor({ horizonYears, allocation, onChange }: Props) {
  const mode = modeOf(allocation);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    const current = weightsOf(allocation);
    if (m === 'fixed')
      onChange({ type: 'static', weights: current });
    if (m === 'glide')
      onChange({
        type: 'glidepath',
        start: current,
        end: { stock: Math.max(0, current.stock - 0.2), bond: Math.min(1, current.bond + 0.2), cash: current.cash },
        transitionYears: horizonYears,
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
      {mode === 'fixed' && (
        <FixedAllocationEditor
          weights={allocation.type === 'static' ? allocation.weights : { stock: 0.6, bond: 0.4, cash: 0 }}
          onChange={(w) => onChange({ type: 'static', weights: w })}
        />
      )}
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

function FixedAllocationEditor({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  const toStr = (v: number) => Math.round(v * 100).toString();
  const [stock, setStock] = useState(toStr(weights.stock));
  const [bond, setBond] = useState(toStr(weights.bond));
  const [cash, setCash] = useState(toStr(weights.cash));

  const sum = (parseFloat(stock) || 0) + (parseFloat(bond) || 0) + (parseFloat(cash) || 0);
  const valid = Math.abs(sum - 100) < 0.01;

  const commit = (s: string, b: string, c: string) => {
    const sv = parseFloat(s) || 0;
    const bv = parseFloat(b) || 0;
    const cv = parseFloat(c) || 0;
    const total = sv + bv + cv;
    if (Math.abs(total - 100) < 0.01) {
      onChange({ stock: sv / 100, bond: bv / 100, cash: cv / 100 });
    }
  };

  return (
    <div className="fixed-alloc-editor">
      {(['stock', 'bond', 'cash'] as const).map((asset) => {
        const val = asset === 'stock' ? stock : asset === 'bond' ? bond : cash;
        const setter = asset === 'stock' ? setStock : asset === 'bond' ? setBond : setCash;
        return (
          <label key={asset} className="fixed-alloc-row">
            <span className="fixed-alloc-label">{asset.charAt(0).toUpperCase() + asset.slice(1)}</span>
            <div className="fixed-alloc-input-wrap">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={val}
                onChange={(e) => {
                  setter(e.target.value);
                  const newVals = {
                    stock: asset === 'stock' ? e.target.value : stock,
                    bond: asset === 'bond' ? e.target.value : bond,
                    cash: asset === 'cash' ? e.target.value : cash,
                  };
                  commit(newVals.stock, newVals.bond, newVals.cash);
                }}
              />
              <span className="fixed-alloc-pct">%</span>
            </div>
          </label>
        );
      })}
      {!valid && (
        <p className="fixed-alloc-warn">Must sum to 100% (currently {sum.toFixed(0)}%)</p>
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
    { k: 'fixed', label: 'fixed' },
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
