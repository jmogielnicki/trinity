import { useEffect, useState } from 'react';
import { GlidePath } from './components/controls/GlidePath';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { ScenarioActions } from './components/controls/ScenarioActions';
import { ScenarioLibrary } from './components/controls/ScenarioLibrary';
import { SweepSelector } from './components/controls/SweepSelector';
import { TailMethodInput } from './components/controls/TailMethodInput';
import { WithdrawalEditor } from './components/controls/WithdrawalEditor';
import { CalendarHeatmap } from './components/results/CalendarHeatmap';
import { Heatmap } from './components/results/Heatmap';
import { SmallMultiples } from './components/results/SmallMultiples';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { WhereAmI } from './components/results/WhereAmI';
import { loadHistorical } from './data/load';
import { tryDeserialize } from './data/urlState';
import { useCompareStore } from './store/compareStore';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
import './App.css';

type View = 'spaghetti' | 'calendar' | 'whereami';

export function App() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const {
    data,
    result,
    grid,
    computeMs,
    pool,
    computing,
    setData,
    setPool,
    recompute,
  } = useResultsStore();
  const snapshot = useCompareStore((s) => s.snapshot);
  const [view, setView] = useState<View>('spaghetti');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await loadHistorical();
      if (cancelled) return;
      setData(d);
      const p = createPool();
      await setPool(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [setData, setPool]);

  // Hydrate from URL hash on first load.
  useEffect(() => {
    const parsed = tryDeserialize(location.hash);
    if (!parsed) return;
    scenario.setBalance(parsed.initialBalance);
    scenario.setHorizon(parsed.horizonYears);
    scenario.setAllocation(parsed.allocation);
    scenario.setWithdrawal(parsed.withdrawal);
    if (parsed.tailMethod) scenario.setTailMethod(parsed.tailMethod);
    (Object.keys(parsed.axes) as Array<keyof typeof parsed.axes>).forEach((a) =>
      sweep.setAxis(a, parsed.axes[a]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || !pool) return;
    const id = setTimeout(() => {
      void recompute(scenario, sweep);
    }, 150);
    return () => clearTimeout(id);
  }, [
    data,
    pool,
    scenario.initialBalance,
    scenario.horizonYears,
    scenario.allocation,
    scenario.withdrawal,
    sweep.axes,
    recompute,
    scenario,
    sweep,
  ]);

  const showSweepViews = !!grid && grid.axes.length > 0;

  return (
    <div className="app">
      <header>
        <h1>Historical Withdrawal Simulator</h1>
        <p className="subtitle">
          Stress-test against every retirement start year from{' '}
          {data?.start ?? '…'} to {data?.end ?? '…'}.
        </p>
      </header>
      <div className="layout">
        <aside className="controls">
          <PortfolioInput />
          <GlidePath
            horizonYears={scenario.horizonYears}
            allocation={scenario.allocation}
            onChange={scenario.setAllocation}
          />
          <WithdrawalEditor
            horizonYears={scenario.horizonYears}
            withdrawal={scenario.withdrawal}
            onChange={scenario.setWithdrawal}
          />
          <TailMethodInput />
          <SweepSelector />
          <ScenarioActions />
          <ScenarioLibrary />
        </aside>
        <main className="results">
          {!data && <div className="loading">Loading historical data…</div>}
          {data && (
            <div className="compute-meta">
              Compute: {computeMs.toFixed(0)} ms{computing ? ' …' : ''}
              {pool && <span className="pool-meta"> ({pool.size} workers)</span>}
              {result && !showSweepViews && (
                <span className="view-toggle">
                  view:
                  <button
                    className={view === 'spaghetti' ? 'active' : ''}
                    onClick={() => setView('spaghetti')}
                  >
                    spaghetti
                  </button>
                  <button
                    className={view === 'calendar' ? 'active' : ''}
                    onClick={() => setView('calendar')}
                  >
                    calendar
                  </button>
                  <button
                    className={view === 'whereami' ? 'active' : ''}
                    onClick={() => setView('whereami')}
                  >
                    where am i
                  </button>
                </span>
              )}
            </div>
          )}
          {data && result && !showSweepViews && (
            <>
              <StatPanel result={result} />
              {view === 'spaghetti' && (
                <SpaghettiChart
                  result={result}
                  overlay={snapshot?.result ?? null}
                />
              )}
              {view === 'calendar' && (
                <CalendarHeatmap
                  result={result}
                  initialBalance={scenario.initialBalance}
                />
              )}
              {view === 'whereami' && (
                <WhereAmI
                  result={result}
                  horizonYears={scenario.horizonYears}
                  initialBalance={scenario.initialBalance}
                  dataEnd={data.end}
                />
              )}
            </>
          )}
          {data && grid && grid.axes.length === 1 && (
            <SmallMultiples grid={grid} />
          )}
          {data && grid && grid.axes.length === 2 && <Heatmap grid={grid} />}
        </main>
      </div>
    </div>
  );
}
