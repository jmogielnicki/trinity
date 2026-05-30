import { useEffect, useMemo, useState } from "react";
import { useLibraryStore, type SavedScenario } from "../../store/libraryStore";
import { useResultsStore } from "../../store/resultsStore";
import { useScenarioStore } from "../../store/scenarioStore";
import {
	COMPARE_MAX,
	useCompareScenariosStore,
	type CompareEntry,
} from "../../store/compareScenariosStore";
import { PRESETS } from "../../data/presets";
import { ScenarioCard } from "./ScenarioCard";
import { ComparisonTable } from "./ComparisonTable";
import { colorAt } from "../seriesColors";
import {
	FinalBalanceDistributionChart,
	SpendDistributionChart,
	BalanceOverTimeChart,
	SpendOverTimeChart,
	type Series,
	type YearMode,
} from "../results/overlayCharts";
import { FIELD_BASE } from "../ui/fieldCls";

type PickerItem = SavedScenario & { isPreset: boolean; description?: string };

function successCls(r: number): string {
	if (!Number.isFinite(r)) return "text-text-faint";
	if (r >= 0.95) return "text-success";
	if (r < 0.8) return "text-error";
	return "text-text";
}

function SummaryTable({ entries }: { entries: CompareEntry[] }) {
	return (
		<div className="border border-border-light rounded p-2 bg-surface-page flex flex-col h-full min-w-0">
			<div className="flex items-center justify-between gap-4 text-xs text-text-muted mb-1.5 px-1">
				<span>Strategy</span>
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
							<span className="text-sm font-medium text-text truncate">
								{e.saved.name}
							</span>
						</span>
						<span
							className={`text-sm tabular-nums font-semibold ${successCls(
								e.metrics.successRate,
							)}`}
						>
							{Number.isFinite(e.metrics.successRate)
								? `${(e.metrics.successRate * 100).toFixed(1)}%`
								: "—"}
						</span>
					</div>
				))}
			</div>
			<div className="h-9 shrink-0" />
		</div>
	);
}

// Inline sticky bar that tracks selection across the view
function CompareBar({
	selectedIds,
	allItems,
	toggle,
	max = COMPARE_MAX,
}: {
	selectedIds: string[];
	allItems: PickerItem[];
	toggle: (id: string) => void;
	max?: number;
}) {
	const items = selectedIds
		.map((id, i) => ({
			s: allItems.find((s) => s.id === id),
			c: colorAt(i),
		}))
		.filter((x) => x.s);

	return (
		<div className="sticky top-[var(--header-h)] z-20 -mx-3 px-3 sm:-mx-6 sm:px-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 py-2.5 mb-2 bg-surface-page/90 backdrop-blur-md border-b border-border-light min-h-[52px]">
			<div className="flex flex-wrap items-center gap-1.5 flex-1 min-h-[28px]">
				{items.length === 0 && (
					<span className="text-xs text-text-faint italic">
						Pick up to {max} strategies to compare
					</span>
				)}
				{items.map(({ s, c }) => (
					<button
						key={s!.id}
						onClick={() => toggle(s!.id)}
						className="inline-flex items-center gap-1.5 h-[26px] px-2 rounded-full border-[1.5px] text-xs font-medium cursor-pointer hover:-translate-y-px hover:shadow-sm transition-all min-w-0 max-w-[calc(50%-3px)] sm:max-w-none"
						style={{
							borderColor: c,
							backgroundColor: `${c}1a`,
							color: c,
						}}
						title="Remove"
					>
						<span
							className="w-2 h-2 rounded-full shrink-0"
							style={{ backgroundColor: c }}
						/>
						<span className="leading-none truncate min-w-0 text-text">
							{s!.name}
						</span>
						<svg
							className="opacity-55 ml-0.5 hover:opacity-100 transition-opacity shrink-0"
							width="10"
							height="10"
							viewBox="0 0 10 10"
						>
							<path
								d="M2 2 L8 8 M8 2 L2 8"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				))}
				{items.length > 0 &&
					items.length < max &&
					Array.from({ length: max - items.length }).map((_, i) => (
						<span
							key={"slot" + i}
							className="w-[18px] h-[18px] rounded-full border-[1.5px] border-dashed opacity-35"
							style={{ borderColor: colorAt(items.length + i) }}
						/>
					))}
			</div>
		</div>
	);
}

export function CompareScenariosView() {
	const saved = useLibraryStore((s) => s.saved);
	const libraryLoading = useLibraryStore((s) => s.loading);
	const saveToLibrary = useLibraryStore((s) => s.save);
	const removeFromLibrary = useLibraryStore((s) => s.remove);
	const pool = useResultsStore((s) => s.pool);
	const data = useResultsStore((s) => s.data);
	const initialBalance = useScenarioStore((s) => s.initialBalance);
	const horizonYears = useScenarioStore((s) => s.horizonYears);
	const {
		selectedIds,
		entries,
		running,
		computeMs,
		toggle,
		setSelection,
		run,
	} = useCompareScenariosStore();

	const [pendingDelete, setPendingDelete] = useState<PickerItem | null>(null);
	const [presetsOpen, setPresetsOpen] = useState(true);
	const [yearMode, setYearMode] = useState<YearMode>("median");
	const [missingDismissed, setMissingDismissed] = useState(false);

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

	const allItems = useMemo<PickerItem[]>(
		() => [...savedItems, ...presetItems],
		[savedItems, presetItems],
	);

	const allItemIds = useMemo(() => new Set(allItems.map((i) => i.id)), [allItems]);

	// IDs from URL that don't exist in this user's library or presets.
	const missingIds = useMemo(
		() => (!libraryLoading ? selectedIds.filter((id) => !allItemIds.has(id)) : []),
		[selectedIds, allItemIds, libraryLoading],
	);

	// Once the library finishes loading, drop any missing IDs from the selection
	// so the compare runs correctly with whatever strategies are available.
	useEffect(() => {
		if (libraryLoading || missingIds.length === 0) return;
		setSelection(selectedIds.filter((id) => allItemIds.has(id)));
	}, [libraryLoading, missingIds.length]);

	useEffect(() => {
		if (selectedIds.length > 0) return;
		if (saved.length >= 2) {
			// Enough saved strategies to compare on their own — focus on them
			// and tuck the presets away.
			setSelection(saved.slice(0, COMPARE_MAX).map((s) => s.id));
			setPresetsOpen(false);
		} else {
			setSelection(presetItems.slice(0, 3).map((p) => p.id));
		}
	}, [saved]);

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

	const chartSeries = useMemo<Series[]>(
		() =>
			entries.map((e, i) => ({
				id: e.saved.id,
				label: e.saved.name,
				color: colorAt(i),
				metrics: e.metrics,
				result: e.result,
			})),
		[entries],
	);

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		const id = pendingDelete.id;
		setPendingDelete(null);
		if (selectedIds.includes(id)) toggle(id);
		await removeFromLibrary(id);
	};

const renderCard = (item: PickerItem) => {
    const checked = selectedIds.includes(item.id);
    const pickIndex = selectedIds.indexOf(item.id);

    // Check if this preset already exists in the user's saved list (matching by name)
    const savedMatch = item.isPreset ? savedItems.find(s => s.name === item.name) : undefined;
    const isSaved = !!savedMatch;

    return (
      <ScenarioCard
        key={item.id}
        name={item.name}
        color={colorById.get(item.id)}
        selected={checked}
        disabled={!checked && selectedIds.length >= COMPARE_MAX}
        pickIndex={checked ? pickIndex : undefined}
        allocation={item.state.allocation}
        withdrawal={item.state.withdrawal}
        withdrawalSource={item.state.withdrawalSource}
        isPreset={item.isPreset}
        isSaved={isSaved}
        description={item.description}
        onToggle={() => toggle(item.id)}
        onSave={
          item.isPreset
            ? () => {
                if (isSaved && savedMatch) {
                  // If it's already saved, clicking it again triggers the unsave modal
                  setPendingDelete(savedMatch);
                } else {
                  void saveToLibrary(item.name, item.state);
                }
              }
            : undefined
        }
        onDelete={item.isPreset ? undefined : () => setPendingDelete(item)}
      />
    );
  };

	// Adjusted grid to handle slightly wider expanded cards nicely
	const cardGrid =
		"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 items-start";

	return (
		<div className="flex flex-col gap-4 text-base relative">
			<CompareBar
				selectedIds={selectedIds}
				allItems={allItems}
				toggle={toggle}
				max={COMPARE_MAX}
			/>

			<div className="text-text-secondary text-sm leading-[1.4] max-w-[760px] -mt-1">
				<strong>Compare strategies</strong> — pick strategies (your saved
				ones, or the presets below) and run each across every historical
				start year, lined up side by side. Pick up to {COMPARE_MAX}.
			</div>

			{missingIds.length > 0 && !missingDismissed && (
				<div className="flex items-start gap-2.5 px-3 py-2.5 bg-surface border border-border-strong rounded-md text-sm text-text-secondary">
					<svg className="flex-shrink-0 mt-px text-text-muted" width="15" height="15" viewBox="0 0 15 15" fill="none">
						<path d="M7.5 1.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM7.5 5v3.5M7.5 10h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
					</svg>
					<span className="flex-1">
						{missingIds.length === 1
							? "1 strategy from this shared link isn't in your library and was removed from the comparison."
							: `${missingIds.length} strategies from this shared link aren't in your library and were removed from the comparison.`}
					</span>
					<button
						className="flex-shrink-0 text-text-faint hover:text-text-muted bg-transparent border-none cursor-pointer p-0 leading-none"
						onClick={() => setMissingDismissed(true)}
						aria-label="Dismiss"
					>
						✕
					</button>
				</div>
			)}

			<div className="flex flex-col gap-6">
				{/* Saved Scenarios Section */}
				<div className="flex flex-col">
					<div className="flex items-baseline gap-2 px-1 pb-2">
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
							Your saved strategies
						</span>
						<span className="text-[11.5px] font-medium text-text-faint">
							{savedItems.length === 0
								? "none yet"
								: savedItems.length}
						</span>
					</div>
					{savedItems.length === 0 ? (
						<div className="flex items-center gap-2.5 p-3.5 bg-surface border-[1.5px] border-dashed border-border-light rounded-lg text-[12.5px] text-text-muted">
							<svg
								width="18"
								height="18"
								viewBox="0 0 18 18"
								fill="none"
								className="flex-shrink-0 text-text-faint"
							>
								<path
									d="M5 3 H13 V15 L9 12 L5 15 Z"
									stroke="currentColor"
									strokeWidth="1.4"
									strokeLinejoin="round"
								/>
							</svg>
							<span>
								No saved strategies yet — click{" "}
								<b className="font-semibold text-text-secondary">
									Save
								</b>{" "}
								on a preset below to start your list.
							</span>
						</div>
					) : (
						<div className={cardGrid}>
							{savedItems.map(renderCard)}
						</div>
					)}
				</div>

				{/* Presets Section */}
				<div className="flex flex-col">
					<button
						className="flex items-baseline gap-2 px-1.5 py-1.5 -ml-1.5 bg-transparent border-none rounded-md cursor-pointer hover:bg-surface-hover transition-colors text-left w-full"
						onClick={() => setPresetsOpen(!presetsOpen)}
						aria-expanded={presetsOpen}
					>
						<span
							className={`inline-flex items-center justify-center w-3 h-3 text-text-muted transition-transform duration-200 ${
								presetsOpen ? "rotate-90" : ""
							}`}
						>
							<svg width="10" height="10" viewBox="0 0 10 10">
								<path
									d="M3 1.5 L7 5 L3 8.5"
									stroke="currentColor"
									strokeWidth="1.6"
									fill="none"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
							Presets
						</span>
						<span className="text-[11.5px] font-medium text-text-faint">
							{presetItems.length}
						</span>
						<span className="ml-auto text-[10.5px] font-medium tracking-[0.04em] text-text-muted">
							{presetsOpen ? "Hide" : "Show"}
						</span>
					</button>

					{presetsOpen && (
						<div className={`${cardGrid} mt-1`}>
							{presetItems.map(renderCard)}
						</div>
					)}
				</div>
			</div>

			{entries.length > 0 && (
				<div className="text-xs text-text-faint mt-4 border-t border-border-light pt-4">
					{entries.length}{" "}
					{entries.length === 1 ? "strategy" : "strategies"} compared ·
					compute {computeMs.toFixed(0)} ms
					{running ? " · updating…" : ""}
				</div>
			)}

			{entries.length === 0 ? (
				<p className="text-sm text-text-faint py-4 text-center border border-dashed border-text-disabled rounded">
					{selectedIds.length === 0
						? "Select at least one strategy above to compare."
						: "Computing…"}
				</p>
			) : (
				<div className="flex flex-col gap-4">
					<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-3">
						<SummaryTable entries={entries} />
						<FinalBalanceDistributionChart series={chartSeries} />
						<SpendDistributionChart series={chartSeries} />
					</div>

					<div className="flex items-center gap-2 text-sm text-text-secondary mt-2">
						<span>Play out each strategy's</span>
						<select
							className={`${FIELD_BASE} px-2 py-[3px] text-text`}
							value={yearMode}
							onChange={(e) =>
								setYearMode(e.target.value as YearMode)
							}
						>
							<option value="worst">worst</option>
							<option value="median">median</option>
							<option value="best">best</option>
						</select>
						<span>historical start year (by final balance).</span>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
						<BalanceOverTimeChart
							series={chartSeries}
							mode={yearMode}
						/>
						<SpendOverTimeChart series={chartSeries} mode={yearMode} />
					</div>

					<details className="border border-border-light rounded bg-surface-page mt-2">
						<summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary select-none hover:bg-surface-hover">
							Show full metrics table
						</summary>
						<div className="px-2 pb-2">
							<ComparisonTable entries={entries} />
						</div>
					</details>
				</div>
			)}

			{/* Delete Confirmation Modal */}
			{pendingDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div
						className="absolute inset-0 bg-black/50"
						onClick={() => setPendingDelete(null)}
					/>
					<div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[360px] flex flex-col gap-4 p-5 animate-in fade-in zoom-in-95 duration-150">
						<h2 className="font-display m-0 text-lg font-bold text-text">
							Delete strategy?
						</h2>
						<p className="text-sm text-text-secondary leading-[1.5]">
							“{pendingDelete.name}” will be permanently removed
							from your library. This can’t be undone.
						</p>
						<div className="flex justify-end gap-2 mt-1">
							<button
								className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border cursor-pointer hover:bg-surface-hover transition-colors"
								onClick={() => setPendingDelete(null)}
							>
								Cancel
							</button>
							<button
								className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-error cursor-pointer hover:opacity-90 transition-opacity"
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
