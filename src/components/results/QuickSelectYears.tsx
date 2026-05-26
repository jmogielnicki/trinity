import { useMemo } from 'react';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { ToggleButton } from '../ui/ToggleButton';
import { TabBar } from '../ui/TabBar';

type Props = {
  result: ScenarioResult;
  selectedYears: Set<number>;
  /** Select (or, when already the sole selection, deselect) a start year. */
  onSelect: (year: number, alreadySelected: boolean) => void;
};

/** Terminal value used to rank outcomes: depleted runs count as 0. */
function outcomeValue(s: SimulationResult): number {
  return s.success ? (s.finalBalance ?? 0) : 0;
}

/**
 * Quick-select buttons (worst / median / best historical start year) below the
 * results charts. Clicking one highlights that year in both charts — a nudge
 * that the charts themselves are selectable.
 */
export function QuickSelectYears({ result, selectedYears, onSelect }: Props) {
  const picks = useMemo(() => {
    const completed = result.sims.filter((s) => !s.inProgress && !s.bootstrapped);
    if (completed.length === 0) return [];
    const byValue = [...completed].sort((a, b) => {
      const av = outcomeValue(a);
      const bv = outcomeValue(b);
      if (av !== bv) return av - bv;
      // Tie-break among depleted runs: an earlier depletion is the worse case.
      return (a.depletedAt ?? Infinity) - (b.depletedAt ?? Infinity);
    });
    return [
      { key: 'worst', label: 'Worst year', year: byValue[0].startYear },
      { key: 'median', label: 'Median year', year: byValue[Math.floor((byValue.length - 1) / 2)].startYear },
      { key: 'best', label: 'Best year', year: byValue[byValue.length - 1].startYear },
    ];
  }, [result.sims]);

  if (picks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <span className="text-xs text-text-muted">Jump to a notable start year:</span>
      <TabBar>
        {picks.map((p) => {
          const active = selectedYears.size === 1 && selectedYears.has(p.year);
          return (
            <ToggleButton key={p.key} active={active} onClick={() => onSelect(p.year, active)}>
              {p.label} · {p.year}
            </ToggleButton>
          );
        })}
      </TabBar>
    </div>
  );
}
