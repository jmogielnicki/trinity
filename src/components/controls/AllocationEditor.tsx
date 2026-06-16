import { useState, useEffect } from 'react';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { FixedAllocationBar } from './FixedAllocationBar';
import { AllocationRuleBuilder } from './AllocationRuleBuilder';
import { CustomScriptEditor } from './CustomScriptEditor';
import { GlidePath } from './GlidePath';
import { FieldNote } from '../ui/FieldNote';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';

type Mode = 'fixed' | 'glide' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
};

/** Horizon at/above which a 100%-equity sleeve is worth flagging. */
const LONG_HORIZON = 40;

/** Peak stock / cash weights a strategy ever holds, for soft warnings. Returns
 *  null for strategies we can't statically read (custom/rule-based scripts). */
function weightExtremes(
  a: AllocationStrategy,
): { maxStock: number; maxCash: number } | null {
  if (a.type === 'static')
    return { maxStock: a.weights.stock, maxCash: a.weights.cash };
  if (a.type === 'glidepath')
    return {
      maxStock: Math.max(a.start.stock, a.end.stock),
      maxCash: Math.max(a.start.cash, a.end.cash),
    };
  return null;
}

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
  const extremes = weightExtremes(allocation);
  const allEquityWarning =
    extremes != null && extremes.maxStock >= 0.99 && horizonYears >= LONG_HORIZON;
  // Cohorts start in 1871; cash data only begins 1934. So any cash sleeve runs
  // many years with 0% real cash returns. See FOLLOWUPS.md.
  const cashNote = extremes != null && extremes.maxCash > 0;

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
      {allEquityWarning && (
        <FieldNote>
          100% stocks over a {horizonYears}-year horizon means deep drawdowns
          along the way. Historically survivable, but expect a volatile ride —
          a bond sleeve cushions bad early sequences.
        </FieldNote>
      )}
      {cashNote && (
        <FieldNote variant="info">
          Cash earns 0% real before 1934 (no data) — early cohorts hold the cash
          sleeve flat in real terms rather than earning a yield.
        </FieldNote>
      )}
    </div>
  );
}

function FixedAllocationEditor({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const [local, setLocal] = useState(weights);
  useEffect(() => { setLocal(weights); }, [weights]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">Drag the handles to set the allocation.</div>
      <FixedAllocationBar
        weights={local}
        onChange={(w) => { setLocal(w); onChange(w); }}
      />
    </div>
  );
}

function ModeToggle({ current, onChange }: { current: Mode; onChange: (m: Mode) => void }) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'fixed', label: 'Fixed' },
    { k: 'glide', label: 'Glide' },
    { k: 'rules', label: 'Rules' },
    { k: 'script', label: 'Script' },
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
