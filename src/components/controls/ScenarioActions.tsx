import { useCallback } from 'react';
import { downloadCsv, simsToCsv } from '../../data/exportCsv';
import { serialize } from '../../data/urlState';
import {
  CURRENT_COLOR,
  SNAPSHOT_COLOR,
  useCompareStore,
} from '../../store/compareStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';

export function ScenarioActions() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const result = useResultsStore((s) => s.result);
  const { snapshot, setSnapshot } = useCompareStore();

  const onShare = useCallback(async () => {
    const hash = serialize({
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: scenario.allocation,
      withdrawal: scenario.withdrawal,
      axes: sweep.axes,
      tailMethod: scenario.tailMethod,
      withdrawalSource: scenario.withdrawalSource,
      ...(scenario.incomes.length > 0 && { incomes: scenario.incomes }),
      ...(scenario.cashflows.length > 0 && { cashflows: scenario.cashflows }),
      ...(scenario.retireAge != null && { retireAge: scenario.retireAge }),
    });
    const url = `${location.origin}${location.pathname}#${hash}`;
    history.replaceState(null, '', `#${hash}`);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore — URL is still in the address bar.
    }
  }, [scenario, sweep]);

  const onSnapshot = useCallback(() => {
    if (!result) return;
    setSnapshot({
      label: 'snapshot',
      result,
      color: SNAPSHOT_COLOR,
    });
  }, [result, setSnapshot]);

  const onCsv = useCallback(() => {
    if (!result) return;
    downloadCsv('sims.csv', simsToCsv(result));
  }, [result]);

  return (
    <div className="flex flex-row flex-wrap gap-1.5">
      <button className="text-sm px-[9px] py-[5px] border border-text-disabled bg-surface rounded cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" onClick={onShare} title="Copy a shareable URL">
        copy share link
      </button>
      <button className="text-sm px-[9px] py-[5px] border border-text-disabled bg-surface rounded cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" onClick={onCsv} disabled={!result}>
        export csv
      </button>
      {snapshot ? (
        <button className="text-sm px-[9px] py-[5px] border border-text-disabled bg-surface rounded cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => setSnapshot(null)}>
          clear comparison
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SNAPSHOT_COLOR }} />
        </button>
      ) : (
        <button className="text-sm px-[9px] py-[5px] border border-text-disabled bg-surface rounded cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" onClick={onSnapshot} disabled={!result}>
          snapshot current
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CURRENT_COLOR }} />
        </button>
      )}
    </div>
  );
}
