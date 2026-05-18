import { useState } from 'react';
import { PRESETS } from '../../data/presets';
import type { SerializedState } from '../../data/urlState';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';

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
    <div className="control-group">
      <div className="control-label">Presets</div>
      <select
        className="preset-select"
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
      {description && <div className="rule-hint">{description}</div>}
    </div>
  );
}
