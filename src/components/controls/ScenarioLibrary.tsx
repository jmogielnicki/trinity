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
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">Scenario library (localStorage)</div>
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="name"
          className="flex-1 px-1.5 py-1 border border-text-disabled rounded-[3px] text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="text-sm px-2 py-1 border border-text-disabled bg-surface rounded-[3px] cursor-pointer self-start" onClick={onSave}>
          save current
        </button>
      </div>
      {saved.length === 0 ? (
        <div className="text-xs text-text-faint">no saved scenarios yet</div>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-1">
          {saved.map((s) => (
            <li key={s.id} className="flex items-center">
              <button className="flex-1 text-left bg-surface-hover border border-border-light rounded-[3px] px-2 py-1 cursor-pointer text-sm hover:bg-surface-code" onClick={() => onLoad(s)}>
                {s.name}
              </button>
              <button className="ml-auto border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-error" onClick={() => remove(s.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
