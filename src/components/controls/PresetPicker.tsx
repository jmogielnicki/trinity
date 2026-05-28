import { useEffect, useRef, useState } from 'react';
import { PRESETS } from '../../data/presets';
import type { SerializedState } from '../../data/urlState';
import { useLibraryStore } from '../../store/libraryStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';
import { FIELD_FULL } from '../ui/fieldCls';

export function PresetPicker() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const saved = useLibraryStore((s) => s.saved);
  const [picked, setPicked] = useState('');
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const appliedRef = useRef<{ allocation: string; withdrawal: string } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const apply = (state: SerializedState) => {
    scenario.setAllocation(state.allocation);
    scenario.setWithdrawal(state.withdrawal);
    if (state.tailMethod) scenario.setTailMethod(state.tailMethod);
    if (state.withdrawalSource)
      scenario.setWithdrawalSource(state.withdrawalSource);
    (Object.keys(state.axes) as Array<keyof typeof state.axes>).forEach((a) =>
      sweep.setAxis(a, state.axes[a]),
    );
    appliedRef.current = {
      allocation: JSON.stringify(state.allocation),
      withdrawal: JSON.stringify(state.withdrawal),
    };
  };

  const onChange = (value: string) => {
    setPicked(value);
    setTooltipOpen(false);
    if (!value) return;
    if (value.startsWith('preset:')) {
      const p = PRESETS.find((x) => x.id === value.slice('preset:'.length));
      if (p) apply(p.state);
    } else if (value.startsWith('saved:')) {
      const sv = saved.find((x) => x.id === value.slice('saved:'.length));
      if (sv) apply(sv.state);
    }
  };

  // Clear preset label as soon as the user modifies any strategy value
  useEffect(() => {
    if (!picked || !appliedRef.current) return;
    const curAllocation = JSON.stringify(scenario.allocation);
    const curWithdrawal = JSON.stringify(scenario.withdrawal);
    if (
      curAllocation !== appliedRef.current.allocation ||
      curWithdrawal !== appliedRef.current.withdrawal
    ) {
      setPicked('');
      setTooltipOpen(false);
      appliedRef.current = null;
    }
  }, [scenario.allocation, scenario.withdrawal, picked]);

  // Close tooltip on outside click
  useEffect(() => {
    if (!tooltipOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !tooltipRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setTooltipOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltipOpen]);

  const presetId = picked.startsWith('preset:') ? picked.slice('preset:'.length) : null;
  const description = presetId ? PRESETS.find((p) => p.id === presetId)?.description : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">Start from</div>
      <div className="flex items-center gap-1.5">
          <select
            className={`${FIELD_FULL} cursor-pointer`}
            value={picked}
            onChange={(e) => onChange(e.target.value)}
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
          {description && (
            <div className="relative flex-shrink-0">
              <button
                ref={btnRef}
                className={`w-5 h-5 rounded-full border border-text-disabled bg-surface cursor-pointer text-xs font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover flex-shrink-0${tooltipOpen ? ' bg-primary text-surface border-primary' : ''}`}
                onClick={() => setTooltipOpen((v) => !v)}
                title="About this preset"
              >
                ?
              </button>
              {tooltipOpen && (
                <div
                  ref={tooltipRef}
                  className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-md border border-border bg-surface shadow-popover p-3 text-xs text-text-muted leading-relaxed"
                >
                  {description}
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
