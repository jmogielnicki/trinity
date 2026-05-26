import { useEffect, useMemo } from 'react';
import { useLibraryStore, type SavedScenario } from '../../store/libraryStore';
import { useResultsStore } from '../../store/resultsStore';
import {
  COMPARE_MAX,
  useCompareScenariosStore,
} from '../../store/compareScenariosStore';
import { PRESETS } from '../../data/presets';
import { ScenarioCard } from './ScenarioCard';
import { ComparisonTable } from './ComparisonTable';
import { colorAt } from './compareColors';
import {
  SuccessRateChart,
  OutcomeDistributionChart,
  TrajectoryEnvelopeChart,
  SpendChart,
  ScatterPlot,
  hasDynamicSpend,
} from './charts';

type PickerItem = SavedScenario & { isPreset: boolean; description?: string };

export function CompareScenariosView() {
  const saved = useLibraryStore((s) => s.saved);
  const saveToLibrary = useLibraryStore((s) => s.save);
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const { selectedIds, entries, running, computeMs, toggle, setSelection, clear, run } =
    useCompareScenariosStore();

  const presetItems = useMemo<PickerItem[]>(
    () =>
      PRESETS.map((p) => ({
        id: `preset:${p.id}`,
        name: p.name,
        state: p.state,
        savedAt: 0,
        isPreset: true,
        description: p.description,
      })),
    [],
  );

  const savedItems = useMemo<PickerItem[]>(
    () => saved.map((s) => ({ ...s, isPreset: false })),
    [saved],
  );

  // Combined pool the store resolves selected ids against (saved + presets).
  const allItems = useMemo<PickerItem[]>(
    () => [...savedItems, ...presetItems],
    [savedItems, presetItems],
  );

  // First time in, pre-select a handful so the view isn't blank. Prefer the
  // user's own saved scenarios; fall back to a few presets for fresh accounts.
  useEffect(() => {
    if (selectedIds.length > 0) return;
    if (saved.length > 0) {
      setSelection(saved.slice(0, Math.min(6, saved.length)).map((s) => s.id));
    } else {
      setSelection(presetItems.slice(0, 3).map((p) => p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Re-run whenever the selection changes (debounced, like the single view).
  useEffect(() => {
    if (!pool || !data) return;
    const id = setTimeout(() => void run(allItems, pool), 150);
    return () => clearTimeout(id);
  }, [pool, data, allItems, selectedIds, run]);

  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    selectedIds.forEach((id, i) => m.set(id, colorAt(i)));
    return m;
  }, [selectedIds]);

  const renderCard = (item: PickerItem) => {
    const checked = selectedIds.includes(item.id);
    return (
      <ScenarioCard
        key={item.id}
        name={item.name}
        color={colorById.get(item.id)}
        selected={checked}
        disabled={!checked && selectedIds.length >= COMPARE_MAX}
        allocation={item.state.allocation}
        withdrawal={item.state.withdrawal}
        horizonYears={item.state.horizonYears}
        initialBalance={item.state.initialBalance}
        isPreset={item.isPreset}
        description={item.description}
        onToggle={() => toggle(item.id)}
        onSave={
          item.isPreset
            ? () => void saveToLibrary(item.name, item.state)
            : undefined
        }
      />
    );
  };

  const cardGrid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5';

  return (
    <div className="flex flex-col gap-3.5 text-base">
      <div className="text-text-secondary text-sm leading-[1.4] max-w-[760px]">
        <strong>Compare scenarios</strong> — pick strategies (your saved ones, or
        the presets below) and run each across every historical start year, lined
        up side by side. Pick up to {COMPARE_MAX}.
      </div>

      <div className="border border-border-light rounded p-2.5 bg-surface-page flex flex-col gap-2.5">
        <div className="flex justify-between items-center text-xs text-text-faint">
          <span>
            {selectedIds.length} of {allItems.length} selected
          </span>
          <button
            className="text-xs px-2 py-[3px] border border-text-disabled bg-surface rounded-[3px] cursor-pointer hover:bg-surface-hover"
            onClick={clear}
          >
            Clear
          </button>
        </div>

        {savedItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-medium text-text-muted uppercase tracking-[0.04em]">
              Your saved scenarios
            </div>
            <div className={cardGrid}>{savedItems.map(renderCard)}</div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-text-muted uppercase tracking-[0.04em]">
            Presets
          </div>
          <div className={cardGrid}>{presetItems.map(renderCard)}</div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="text-xs text-text-faint">
          {entries.length} scenario{entries.length === 1 ? '' : 's'} compared ·
          compute {computeMs.toFixed(0)} ms{running ? ' · updating…' : ''}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-text-faint py-4 text-center border border-dashed border-text-disabled rounded">
          {selectedIds.length === 0
            ? 'Select at least one scenario above to compare.'
            : 'Computing…'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-text-body">
            {entries.map((e, i) => (
              <span key={e.saved.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-6 h-[3px] rounded-sm flex-shrink-0"
                  style={{ background: colorAt(i) }}
                />
                {e.saved.name}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <SuccessRateChart entries={entries} />
            <OutcomeDistributionChart entries={entries} />
            <div className="lg:col-span-2">
              <TrajectoryEnvelopeChart entries={entries} />
            </div>
            <div className={hasDynamicSpend(entries) ? '' : 'lg:col-span-2'}>
              <ScatterPlot entries={entries} />
            </div>
            {hasDynamicSpend(entries) && <SpendChart entries={entries} />}
          </div>

          <details className="border border-border-light rounded bg-surface-page">
            <summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary select-none">
              Show full metrics table
            </summary>
            <div className="px-2 pb-2">
              <ComparisonTable entries={entries} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
