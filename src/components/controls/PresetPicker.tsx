import { useState } from 'react';
import { PRESETS } from '../../data/presets';
import type { SerializedState } from '../../data/urlState';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';
import { FIELD_FULL } from '../ui/fieldCls';

export function PresetPicker() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const [picked, setPicked] = useState('');

  const apply = (state: SerializedState) => {
    scenario.setAllocation(state.allocation);
    scenario.setWithdrawal(state.withdrawal);
    if (state.tailMethod) scenario.setTailMethod(state.tailMethod);
    if (state.withdrawalSource)
      scenario.setWithdrawalSource(state.withdrawalSource);
    (Object.keys(state.axes) as Array<keyof typeof state.axes>).forEach((a) =>
      sweep.setAxis(a, state.axes[a]),
    );
  };

  const onChange = (id: string) => {
    setPicked(id);
    if (!id) return;
    const p = PRESETS.find((x) => x.id === id);
    if (p) apply(p.state);
  };

  const description = PRESETS.find((p) => p.id === picked)?.description;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">Presets</div>
      <select
        className={`${FIELD_FULL} cursor-pointer`}
        value={picked}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— pick a starting point —</option>
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {description && <div className="text-xs text-text-faint py-0.5 pb-1">{description}</div>}
    </div>
  );
}
