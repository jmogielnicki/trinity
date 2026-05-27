import { useEffect, useMemo, useState } from 'react';
import { useLibraryStore, type SavedScenario } from '../../store/libraryStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import {
  COMPARE_MAX,
  useCompareScenariosStore,
  type CompareEntry,
} from '../../store/compareScenariosStore';
import { PRESETS } from '../../data/presets';
import { ScenarioCard } from './ScenarioCard';
import { ComparisonTable } from './ComparisonTable';
import { colorAt } from './compareColors';
import {
  FinalBalanceDistributionChart,
  SpendDistributionChart,
  BalanceOverTimeChart,
  SpendOverTimeChart,
  type YearMode,
} from './charts';
import { FIELD_BASE } from '../ui/fieldCls';

type PickerItem = SavedScenario & { isPreset: boolean; description?: string };

function successCls(r: number): string {
  if (!Number.isFinite(r)) return 'text-text-faint';
  if (r >= 0.95) return 'text-success';
  if (r < 0.8) return 'text-error';
  return 'text-text';
}

// Survival summary — doubles as the color legend. Mirrors a chart card's
// vertical structure (title line, top margin, plot area, bottom axis margin)
// so its rows line up with the box-and-whisker rows in the same grid row.
function SummaryTable({ entries }: { entries: CompareEntry[] }) {
  return (
    <div className="border border-border-light rounded p-2 bg-surface-page flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between gap-4 text-xs text-text-muted mb-1.5 px-1">
        <span>Scenario</span>
        <span>Success</span>
      </div>
      <div className="h-2.5 shrink-0" />
      <div className="flex-1 flex flex-col">
        {entries.map((e, i) => (
          <div
            key={e.saved.id}
            className="flex-1 flex items-center justify-between gap-3 px-1"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ background: colorAt(i) }}
              />
              <span className="text-sm font-medium text-text truncate">{e.saved.name}</span>
            </span>
            <span
              className={`text-sm tabular-nums font-semibold ${successCls(
                e.metrics.successRate,
              )}`}
            >
              {Number.isFinite(e.metrics.successRate)
                ? `${(e.metrics.successRate * 100).toFixed(1)}%`
                : '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="h-9 shrink-0" />
    </div>
  );
}

export function CompareScenariosView() {
  const saved = useLibraryStore((s) => s.saved);
  const saveToLibrary = useLibraryStore((s) => s.save);
  const removeFromLibrary = useLibraryStore((s) => s.remove);
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  // Balance + horizon are global (the page inputs), applied to every scenario.
  const initialBalance = useScenarioStore((s) => s.initialBalance);
  const horizonYears = useScenarioStore((s) => s.horizonYears);
  const { selectedIds, entries, running, computeMs, toggle, setSelection, clear, run } =
    useCompareScenariosStore();

  const [pendingDelete, setPendingDelete] = useState<PickerItem | null>(null);
  const [yearMode, setYearMode] = useState<YearMode>('median');

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
      setSelection(saved.slice(0, Math.min(COMPARE_MAX, saved.length)).map((s) => s.id));
    } else {
      setSelection(presetItems.slice(0, 3).map((p) => p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Re-run whenever the selection or the global balance/horizon changes
  // (debounced, like the single view).
  useEffect(() => {
    if (!pool || !data) return;
    const id = setTimeout(
      () => void run(allItems, pool, { initialBalance, horizonYears }),
      150,
    );
    return () => clearTimeout(id);
  }, [pool, data, allItems, selectedIds, initialBalance, horizonYears, run]);

  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    selectedIds.forEach((id, i) => m.set(id, colorAt(i)));
    return m;
  }, [selectedIds]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    if (selectedIds.includes(id)) toggle(id);
    await removeFromLibrary(id);
  };

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
        withdrawalSource={item.state.withdrawalSource}
        isPreset={item.isPreset}
        description={item.description}
        onToggle={() => toggle(item.id)}
        onSave={item.isPreset ? () => void saveToLibrary(item.name, item.state) : undefined}
        onDelete={item.isPreset ? undefined : () => setPendingDelete(item)}
      />
    );
  };

  const cardGrid =
    'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2';

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
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-3">
            <SummaryTable entries={entries} />
            <FinalBalanceDistributionChart entries={entries} />
            <SpendDistributionChart entries={entries} />
          </div>

          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Play out each strategy's</span>
            <select
              className={`${FIELD_BASE} px-2 py-[3px] text-text`}
              value={yearMode}
              onChange={(e) => setYearMode(e.target.value as YearMode)}
            >
              <option value="worst">worst</option>
              <option value="median">median</option>
              <option value="best">best</option>
            </select>
            <span>historical start year (by final balance).</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <BalanceOverTimeChart entries={entries} mode={yearMode} />
            <SpendOverTimeChart entries={entries} mode={yearMode} />
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

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setPendingDelete(null)}
          />
          <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[360px] flex flex-col gap-4 p-5">
            <h2 className="m-0 text-lg font-bold text-text">Delete scenario?</h2>
            <p className="text-sm text-text-secondary leading-[1.5]">
              “{pendingDelete.name}” will be permanently removed from your library.
              This can’t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg text-md font-medium text-text-secondary border border-border cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-md font-medium text-white bg-error cursor-pointer hover:opacity-90 transition-opacity"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
