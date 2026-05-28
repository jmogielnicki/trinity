import { useEffect, useState } from 'react';
import { PRESETS } from '../../data/presets';
import type { SerializedState } from '../../data/urlState';
import { useLibraryStore } from '../../store/libraryStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { useOptimizeStore } from '../../store/optimizeStore';
import { DEFAULT_WITHDRAWAL_SOURCE } from '../../engine/withdrawalSource';
import {
  describeAllocation,
  describeSource,
  describeWithdrawal,
} from '../../engine/study';
import { FIELD_FULL } from '../ui/fieldCls';

/**
 * Picks the base strategy a study varies around: a preset or a saved
 * strategy. Loading a base sets the pinned baseline for all three study
 * dimensions plus the shared balance / horizon / tail method. The swept
 * dimensions then perturb that baseline.
 */
export function StudyBasePicker() {
  const saved = useLibraryStore((s) => s.saved);
  const setBalance = useScenarioStore((s) => s.setBalance);
  const setHorizon = useScenarioStore((s) => s.setHorizon);
  const setTailMethod = useScenarioStore((s) => s.setTailMethod);
  const study = useOptimizeStore((s) => s.study);
  const baseLabel = useOptimizeStore((s) => s.baseLabel);
  const loadBase = useOptimizeStore((s) => s.loadBase);

  const [picked, setPicked] = useState('');

  // An edit to the study detaches it from its base; drop the selection too.
  useEffect(() => {
    if (baseLabel === null) setPicked('');
  }, [baseLabel]);

  const apply = (state: SerializedState, label: string) => {
    setBalance(state.initialBalance);
    setHorizon(state.horizonYears);
    if (state.tailMethod) setTailMethod(state.tailMethod);
    loadBase({
      allocation: state.allocation,
      withdrawal: state.withdrawal,
      source: state.withdrawalSource ?? DEFAULT_WITHDRAWAL_SOURCE,
      label,
    });
  };

  const onPick = (value: string) => {
    setPicked(value);
    if (value.startsWith('preset:')) {
      const p = PRESETS.find((x) => x.id === value.slice('preset:'.length));
      if (p) apply(p.state, p.name);
    } else if (value.startsWith('saved:')) {
      const sv = saved.find((x) => x.id === value.slice('saved:'.length));
      if (sv) apply(sv.state, sv.name);
    }
  };

  return (
    <div className="flex flex-col gap-2 border border-border rounded-md p-3 bg-surface-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-base font-semibold text-text-body">Start from</span>
        <select
          className={`${FIELD_FULL} max-w-[320px] cursor-pointer`}
          value={picked}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="">— a preset or saved strategy —</option>
          {saved.length > 0 && (
            <optgroup label="Your saved strategies">
              {saved.map((s) => (
                <option key={s.id} value={`saved:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Presets">
            {PRESETS.map((p) => (
              <option key={p.id} value={`preset:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>
        {baseLabel && (
          <span className="text-xs text-text-muted">
            varying around <span className="font-medium text-text-secondary">{baseLabel}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-faint">
        <span>
          Baseline holdings:{' '}
          <span className="text-text-secondary">
            {describeAllocation(study.lockedAllocation)}
          </span>
        </span>
        <span>
          Withdrawal:{' '}
          <span className="text-text-secondary">
            {describeWithdrawal(study.lockedWithdrawal)}
          </span>
        </span>
        <span>
          Source:{' '}
          <span className="text-text-secondary">
            {describeSource(study.lockedSource)}
          </span>
        </span>
      </div>
    </div>
  );
}
