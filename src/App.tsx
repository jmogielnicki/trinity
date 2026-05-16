import { useEffect, useState } from 'react';import { AllocationEditor } from './components/controls/AllocationEditor';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { PresetPicker } from './components/controls/PresetPicker';
import { ScenarioActions } from './components/controls/ScenarioActions';
import { ScenarioLibrary } from './components/controls/ScenarioLibrary';
import { SweepSelector } from './components/controls/SweepSelector';
import { TailMethodInput } from './components/controls/TailMethodInput';
import { WithdrawalEditor } from './components/controls/WithdrawalEditor';
import { WithdrawalSourceInput } from './components/controls/WithdrawalSourceInput';
import { CalendarHeatmap } from './components/results/CalendarHeatmap';
import { Heatmap } from './components/results/Heatmap';
import { SmallMultiples } from './components/results/SmallMultiples';
import { Legend } from './components/results/Legend';
import { OutcomeStrip } from './components/results/OutcomeStrip';
import { SleeveChart } from './components/results/SleeveChart';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { SuccessBar } from './components/results/SuccessBar';
import { WhereAmI } from './components/results/WhereAmI';
import { FrontierView } from './components/optimize/FrontierView';
import { EvolveView } from './components/evolve/EvolveView';
import { loadHistorical } from './data/load';
import { gateCustomSrc, serialize, tryDeserialize } from './data/urlState';
import { useCompareStore } from './store/compareStore';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
import './App.css';

type View = 'spaghetti' | 'calendar' | 'whereami' | 'sleeves';
type TopMode = 'single' | 'optimize' | 'evolve';

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
  const [topMode, setTopMode] = useState<TopMode>('single');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());

  const toggleYear = (year: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };
  const marqueeYears = (years: number[]) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      for (const y of years) next.add(y);
      return next;
    });
  };
  const clearSelection = () => setSelectedYears(new Set());

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
    const parsedRaw = tryDeserialize(location.hash);
    if (!parsedRaw) return;
    const parsed = gateCustomSrc(parsedRaw, (src, where) => {
      const preview = src.length > 200 ? src.slice(0, 200) + '…' : src;
      return window.confirm(
        `This shared link includes a custom JavaScript ${where} strategy ` +
          `that will run in your browser:\n\n${preview}\n\nLoad it?`,
      );
    });
    scenario.setBalance(parsed.initialBalance);
    scenario.setHorizon(parsed.horizonYears);
    scenario.setAllocation(parsed.allocation);
    scenario.setWithdrawal(parsed.withdrawal);
    if (parsed.tailMethod) scenario.setTailMethod(parsed.tailMethod);
    if (parsed.withdrawalSource)
      scenario.setWithdrawalSource(parsed.withdrawalSource);
    if (parsed.view) setView(parsed.view as View);
    (Object.keys(parsed.axes) as Array<keyof typeof parsed.axes>).forEach((a) =>
      sweep.setAxis(a, parsed.axes[a]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync single-scenario state to URL hash so shared links restore the exact view.
  useEffect(() => {
    if (topMode !== 'single') return;
    const hash = serialize({
      initialBalance: scenario.initialBalance,
      horizonYears: scenario.horizonYears,
      allocation: scenario.allocation,
      withdrawal: scenario.withdrawal,
      axes: sweep.axes,
      tailMethod: scenario.tailMethod,
      withdrawalSource: scenario.withdrawalSource,
      view,
    });
    history.replaceState(null, '', '#' + hash);
  }, [
    topMode,
    scenario.initialBalance,
    scenario.horizonYears,
    scenario.allocation,
    scenario.withdrawal,
    scenario.tailMethod,
    scenario.withdrawalSource,
    sweep.axes,
    view,
  ]);

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
    scenario.withdrawalSource,
    scenario.tailMethod,
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
          <PresetPicker />
          <PortfolioInput />
          <AllocationEditor
            horizonYears={scenario.horizonYears}
            allocation={scenario.allocation}
            onChange={scenario.setAllocation}
          />
          <WithdrawalEditor
            horizonYears={scenario.horizonYears}
            withdrawal={scenario.withdrawal}
            onChange={scenario.setWithdrawal}
          />
          <WithdrawalSourceInput />
          <TailMethodInput />
          <SweepSelector />
          <ScenarioActions />
          <ScenarioLibrary />
        </aside>
        <main className="results">
          <div className="top-mode-tabs">
            <button
              className={topMode === 'single' ? 'active' : ''}
              onClick={() => setTopMode('single')}
            >
              Single scenario
            </button>
            <button
              className={topMode === 'optimize' ? 'active' : ''}
              onClick={() => setTopMode('optimize')}
            >
              Optimize / frontier
            </button>
            <button
              className={topMode === 'evolve' ? 'active' : ''}
              onClick={() => setTopMode('evolve')}
            >
              Evolve
            </button>
          </div>
          {topMode === 'optimize' && <FrontierView />}
          {topMode === 'evolve' && <EvolveView />}
          {topMode === 'single' && <>
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
                  <button
                    className={view === 'sleeves' ? 'active' : ''}
                    onClick={() => setView('sleeves')}
                  >
                    sleeves
                  </button>
                </span>
              )}
            </div>
          )}
          {data && result && !showSweepViews && (
            <>
              <StatPanel result={result} />
              {view === 'spaghetti' && (
                <>
                  <div className="spaghetti-row">
                    <SpaghettiChart
                      result={result}
                      overlay={snapshot?.result ?? null}
                      selectedYears={selectedYears}
                      onToggle={toggleYear}
                      onMarquee={marqueeYears}
                    />
                    <SuccessBar result={result} />
                  </div>
                  <OutcomeStrip
                    result={result}
                    selectedYears={selectedYears}
                    onToggle={toggleYear}
                    onMarquee={marqueeYears}
                    onClear={clearSelection}
                  />
                </>
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
              {view === 'sleeves' && (
                <SleeveChart result={result} selectedYears={selectedYears} />
              )}
              {view === 'spaghetti' && <Legend />}
            </>
          )}
          {data && grid && grid.axes.length === 1 && (
            <SmallMultiples grid={grid} />
          )}
          {data && grid && grid.axes.length === 2 && <Heatmap grid={grid} />}
          </>}
        </main>
      </div>
    </div>
  );
}
