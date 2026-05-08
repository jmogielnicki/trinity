import { useState } from 'react';
import { useLibraryStore, type SavedScenario } from '../../store/libraryStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';

export function ScenarioLibrary() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const { saved, save, remove } = useLibraryStore();
  const [name, setName] = useState('');

  const onSave = () => {
    save(name, {
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: scenario.allocation,
      withdrawal: scenario.withdrawal,
      axes: sweep.axes,
      tailMethod: scenario.tailMethod,
      withdrawalSource: scenario.withdrawalSource,
    });
    setName('');
  };

  const onLoad = (s: SavedScenario) => {
    scenario.setBalance(s.state.initialBalance);
    scenario.setHorizon(s.state.horizonYears);
    scenario.setAllocation(s.state.allocation);
    scenario.setWithdrawal(s.state.withdrawal);
    if (s.state.tailMethod) scenario.setTailMethod(s.state.tailMethod);
    if (s.state.withdrawalSource)
      scenario.setWithdrawalSource(s.state.withdrawalSource);
    (Object.keys(s.state.axes) as Array<keyof typeof s.state.axes>).forEach(
      (a) => sweep.setAxis(a, s.state.axes[a]),
    );
  };

  return (
    <div className="control-group">
      <div className="control-label">Scenario library (localStorage)</div>
      <div className="lib-save">
        <input
          type="text"
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="apply-btn" onClick={onSave}>
          save current
        </button>
      </div>
      {saved.length === 0 ? (
        <div className="lib-empty">no saved scenarios yet</div>
      ) : (
        <ul className="lib-list">
          {saved.map((s) => (
            <li key={s.id}>
              <button className="lib-load" onClick={() => onLoad(s)}>
                {s.name}
              </button>
              <button className="x-btn" onClick={() => remove(s.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
