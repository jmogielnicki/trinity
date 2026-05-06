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
    <div className="control-group actions">
      <button onClick={onShare} title="Copy a shareable URL">
        copy share link
      </button>
      <button onClick={onCsv} disabled={!result}>
        export csv
      </button>
      {snapshot ? (
        <button onClick={() => setSnapshot(null)}>
          clear comparison
          <span className="dot" style={{ background: SNAPSHOT_COLOR }} />
        </button>
      ) : (
        <button onClick={onSnapshot} disabled={!result}>
          snapshot current
          <span className="dot" style={{ background: CURRENT_COLOR }} />
        </button>
      )}
    </div>
  );
}
