import { useState } from "react";
import type {
	AllocationStrategy,
	WithdrawalStrategy,
} from "../../engine/strategies";
import type { WithdrawalSource } from "../../engine/withdrawalSource";
import { StrategyDetails } from "./StrategyDetails";

type Props = {
	name: string;
	color?: string;
	selected: boolean;
	disabled: boolean;
	allocation: AllocationStrategy;
	withdrawal: WithdrawalStrategy;
	withdrawalSource?: WithdrawalSource;
	isPreset?: boolean;
	isSaved?: boolean;
	description?: string;
	pickIndex?: number;
	onToggle: () => void;
	onSave?: () => void;
	onDelete?: () => void;
};

export function ScenarioCard({
	name,
	color,
	selected,
	disabled,
	allocation,
	withdrawal,
	withdrawalSource,
	isPreset,
  isSaved,
	description,
	pickIndex,
	onToggle,
	onSave,
	onDelete,
}: Props) {
	const [expanded, setExpanded] = useState(false);

	const isSelectedClass = selected
		? "border-transparent shadow-md"
		: expanded
			? "border-border shadow-md"
			: "border-border-light shadow-sm";

	return (
		<div
			title={description}
			className={`relative grid grid-cols-[1fr_auto_auto] grid-rows-[auto_auto] items-center bg-surface rounded-[10px] transition-all duration-150 overflow-hidden border-[1.5px] ${isSelectedClass}`}
			style={
				selected && color
					? {
							borderColor: color,
							boxShadow: `inset 0 0 0 1px ${color}, 0 4px 16px rgba(20,18,14,0.08)`,
						}
					: undefined
			}
		>
			{selected && color && (
				<div
					className="absolute left-0 top-0 bottom-0 w-1 z-10"
					style={{ background: color }}
				/>
			)}

			{/* Title block */}
			<button
				className={`col-start-1 row-start-1 flex items-center gap-[9px] py-[11px] pr-1 bg-transparent border-0 cursor-pointer text-left min-w-0 font-sans transition-all ${
					selected ? "pl-[18px]" : "pl-[14px]"
				}`}
				onClick={() => setExpanded(!expanded)}
				aria-expanded={expanded}
			>
				<span
					className={`flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 transition-transform duration-150 ${
						expanded
							? "rotate-90 text-text-secondary"
							: "text-text-muted"
					}`}
					style={selected && color ? { color } : undefined}
					aria-hidden="true"
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
				<span
					className={`flex-1 text-sm font-semibold leading-[1.25] tracking-[-0.005em] truncate ${
						disabled && !selected ? "text-text-muted" : "text-text"
					}`}
				>
					{name}
				</span>
			</button>

			{/* Action button (Save or Trash) */}
			<div className="col-start-2 row-start-1 mx-2 flex items-center">
        {isPreset ? (
          <button
            className={`flex items-center justify-center gap-1.5 h-[26px] px-[9px] ml-2 mr-0 rounded-md border cursor-pointer text-[11.5px] font-medium transition-colors ${
              isSaved
                ? 'bg-surface-hover border-border-light text-text-secondary hover:border-error hover:text-error group/savebtn'
                : 'bg-surface border-border text-text-secondary hover:border-text-faint hover:text-text'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSave?.();
            }}
            title={isSaved ? "Unsave" : "Save to your list"}
          >
            {isSaved ? (
              <>
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className="text-success group-hover/savebtn:text-error transition-colors">
                  <path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                <span>Saved</span>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 1.5 H9 V10.5 L6 8.5 L3 10.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
                </svg>
                <span>Save</span>
              </>
            )}
          </button>
        ) : (
					<button
						className="flex items-center justify-center w-[30px] h-[26px] ml-2 mr-0 p-0 bg-transparent border border-transparent rounded-md cursor-pointer text-text-muted transition-colors hover:text-error hover:border-error/30 hover:bg-error/5"
						onClick={(e) => {
							e.stopPropagation();
							onDelete?.();
						}}
						title="Remove from saved"
						aria-label="Remove from saved"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 14 14"
							aria-hidden="true"
						>
							<path
								d="M3 4 H11 M5 4 V2.8 H9 V4 M4.5 4 L5 12 H9 L9.5 4"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
								strokeLinejoin="round"
								fill="none"
							/>
						</svg>
					</button>
				)}
			</div>

			{/* Select circle */}
			<button
				className={`col-start-3 row-start-1 mr-3 w-[26px] h-[26px] rounded-full border-[1.5px] flex items-center justify-center p-0 cursor-pointer transition-all ${
					disabled && !selected
						? "opacity-35 cursor-not-allowed border-border bg-surface text-text-faint"
						: selected
							? "border-transparent text-white"
							: "border-border bg-surface text-text-faint hover:border-text-muted hover:text-text-secondary hover:scale-[1.06]"
				}`}
				style={
					selected && color
						? { background: color, borderColor: color }
						: undefined
				}
				onClick={(e) => {
					e.stopPropagation();
					onToggle();
				}}
				disabled={disabled && !selected}
				title={
					selected
						? "Deselect"
						: disabled
							? "Limit reached"
							: "Select to compare"
				}
				aria-pressed={selected}
			>
				{selected ? (
					<span className="leading-none text-xs font-semibold tabular-nums">
						{pickIndex !== undefined ? pickIndex + 1 : ""}
					</span>
				) : (
					<span
						className="inline-flex items-center justify-center"
						aria-hidden="true"
					>
						<svg width="10" height="10" viewBox="0 0 10 10">
							<path
								d="M5 1.5 V8.5 M1.5 5 H8.5"
								stroke="currentColor"
								strokeWidth="1.4"
								strokeLinecap="round"
							/>
						</svg>
					</span>
				)}
			</button>

			{/* Expanded body details */}
			{expanded && (
				<div
					className={`col-span-full row-start-2 pt-1.5 pb-3.5 border-t border-dashed border-border-light ${
						selected ? "pl-[18px] pr-3.5" : "px-3.5"
					}`}
				>
					<StrategyDetails
						allocation={allocation}
						withdrawal={withdrawal}
						withdrawalSource={withdrawalSource}
						className="text-xs"
					/>
				</div>
			)}
		</div>
	);
}
