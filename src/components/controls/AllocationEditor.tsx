import { useState, useEffect } from 'react';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { ASSET } from '../colors';
import { StackedBar } from './StackedBar';
import { AllocationRuleBuilder } from './AllocationRuleBuilder';
import { CustomScriptEditor } from './CustomScriptEditor';
import { GlidePath } from './GlidePath';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';

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
  if (a.type === 'static')    return a.weights;
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
        rules: [{
          if: { type: 'balanceVsInitial', ratio: 1, comparator: '<' },
          then: { type: 'shiftAllocation', delta: { stock: -0.1, bond: 0.1, cash: 0 } },
        }],
      });
    if (m === 'script') onChange({ type: 'customSrc', src: DEFAULT_SCRIPT });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'fixed' && (
        <FixedAllocationEditor
          weights={allocation.type === 'static' ? allocation.weights : { stock: 0.6, bond: 0.4, cash: 0 }}
          onChange={(w) => onChange({ type: 'static', weights: w })}
        />
      )}
      {mode === 'glide' && (
        <GlidePath horizonYears={horizonYears} allocation={allocation} onChange={onChange} />
      )}
      {mode === 'rules' && allocation.type === 'ruleBased' && (
        <AllocationRuleBuilder
          base={allocation.base}
          rules={allocation.rules}
          onChange={(base, rules) => onChange({ type: 'ruleBased', base, rules })}
        />
      )}
      {mode === 'script' && (
        <CustomScriptEditor
          label="Allocation script — return { stock, bond, cash }."
          signature="state"
          kind="allocation"
          initial={allocation.type === 'customSrc' ? allocation.src : DEFAULT_SCRIPT}
          onChange={(src) => onChange({ type: 'customSrc', src })}
        />
      )}
    </div>
  );
}

function FixedAllocationEditor({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const [local, setLocal] = useState(weights);
  useEffect(() => { setLocal(weights); }, [weights]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">Drag the band boundaries to set the allocation.</div>
      <StackedBar
        weights={[local]}
        onChange={(ws) => { setLocal(ws[0]); onChange(ws[0]); }}
      />
      <div className="flex gap-3 text-xs text-text-secondary">
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-sm" style={{ background: ASSET.stock }} /> stocks</span>
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-sm" style={{ background: ASSET.bond }} /> bonds</span>
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-sm" style={{ background: ASSET.cash }} /> cash</span>
      </div>
    </div>
  );
}

function ModeToggle({ current, onChange }: { current: Mode; onChange: (m: Mode) => void }) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'fixed', label: 'fixed' },
    { k: 'glide', label: 'glide' },
    { k: 'rules', label: 'rules' },
    { k: 'script', label: 'script' },
  ];
  return (
    <TabBar>
      {modes.map((m) => (
        <ToggleButton key={m.k} active={current === m.k} onClick={() => onChange(m.k)}>
          {m.label}
        </ToggleButton>
      ))}
    </TabBar>
  );
}
