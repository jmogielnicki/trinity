import { useEffect, useState } from 'react';import { AllocationEditor } from './components/controls/AllocationEditor';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { PresetPicker } from './components/controls/PresetPicker';
import { ScenarioActions } from './components/controls/ScenarioActions';
import { ScenarioLibrary } from './components/controls/ScenarioLibrary';
import { TailMethodInput } from './components/controls/TailMethodInput';
import { WithdrawalEditor } from './components/controls/WithdrawalEditor';
import { WithdrawalSourceInput } from './components/controls/WithdrawalSourceInput';
import { CalendarHeatmap } from './components/results/CalendarHeatmap';
import { SimDetailPanel } from './components/results/SimDetailPanel';
import { Legend } from './components/results/Legend';
import { OutcomeStrip } from './components/results/OutcomeStrip';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { WhereAmI } from './components/results/WhereAmI';
import { FrontierView } from './components/optimize/FrontierView';
import { EvolveView } from './components/evolve/EvolveView';
import { CompareScenariosView } from './components/compare/CompareScenariosView';
import { AboutPanel } from './components/AboutPanel';
import { loadHistorical } from './data/load';
import { gateCustomSrc, serialize, tryDeserialize } from './data/urlState';
import { useCompareStore } from './store/compareStore';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
import './App.css';

type View = 'spaghetti' | 'calendar' | 'whereami';
type TopMode = 'single' | 'optimize' | 'evolve' | 'compare' | 'about';

export function App() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const {
    data,
    result,
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
  const [detailYear, setDetailYear] = useState<number | null>(null);

  const toggleYear = (year: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
    setDetailYear((prev) => (prev === year ? null : year));
  };
  const marqueeYears = (years: number[]) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      for (const y of years) next.add(y);
      return next;
    });
  };
  const clearSelection = () => { setSelectedYears(new Set()); setDetailYear(null); };

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
    if (parsed.view && parsed.view !== 'sleeves')
      setView(parsed.view as View);
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

  return (
    <div className="app">
      <header>
        <div className="header-main">
          <div>
            <h1>Historical Withdrawal Simulator</h1>
            <p className="subtitle">
              Stress-test against every retirement start year from{' '}
              {data?.start ?? '…'} to {data?.end ?? '…'}.
            </p>
          </div>
          <div className="header-actions">
            <ScenarioActions />
            <button
              className={`about-link ${topMode === 'about' ? 'active' : ''}`}
              onClick={() =>
                setTopMode((m) => (m === 'about' ? 'single' : 'about'))
              }
              title="About / methodology"
            >
              ?
            </button>
          </div>
        </div>
      </header>
      <div className="context-bar">
        <span className="context-bar-tag">Context</span>
        <PortfolioInput />
        <span className="context-bar-note">applies to every tab</span>
      </div>
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
          Study / optimize
        </button>
        <button
          className={topMode === 'evolve' ? 'active' : ''}
          onClick={() => setTopMode('evolve')}
        >
          Evolve
        </button>
        <button
          className={topMode === 'compare' ? 'active' : ''}
          onClick={() => setTopMode('compare')}
        >
          Compare scenarios
        </button>
      </div>
      <div className={`layout${topMode === 'single' ? '' : ' no-aside'}`}>
        {topMode === 'single' && (
          <aside className="controls">
            <section className="control-zone">
              <div className="zone-heading">
                <h2>Strategy</h2>
              </div>
              <PresetPicker />
              <h3 className="section-heading">Holdings mix</h3>
              <AllocationEditor
                horizonYears={scenario.horizonYears}
                allocation={scenario.allocation}
                onChange={scenario.setAllocation}
              />
              <h3 className="section-heading">Withdrawal strategy</h3>
              <WithdrawalEditor
                horizonYears={scenario.horizonYears}
                withdrawal={scenario.withdrawal}
                onChange={scenario.setWithdrawal}
              />
              <h3 className="section-heading">Withdrawal source</h3>
              <WithdrawalSourceInput />
              <TailMethodInput />
            </section>
            <ScenarioLibrary />
          </aside>
        )}
        <main className="results">
          {topMode === 'optimize' && (
            <FrontierView onApplied={() => setTopMode('single')} />
          )}
          {topMode === 'evolve' && <EvolveView />}
          {topMode === 'compare' && <CompareScenariosView />}
          {topMode === 'about' && <AboutPanel />}
          {topMode === 'single' && <>
          {!data && <div className="loading">Loading historical data…</div>}
          {data && (
            <div className="compute-meta">
              Compute: {computeMs.toFixed(0)} ms{computing ? ' …' : ''}
              {pool && <span className="pool-meta"> ({pool.size} workers)</span>}
              {result && (
                <span className="view-toggle">
                  view:
                  <button
                    className={
                      view === 'spaghetti' || view === 'whereami'
                        ? 'active'
                        : ''
                    }
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
                </span>
              )}
            </div>
          )}
          {data && result && (() => {
            const recentCohorts =
              result.inProgressCount + (result.projectedCohortCount ?? 0);
            return (
            <>
              {view !== 'whereami' && (
                <StatPanel
                  result={result}
                />
              )}
              {view === 'spaghetti' && (
                <>
                  {recentCohorts > 0 && (
                    <div className="inprogress-banner">
                      <span>
                        {recentCohorts} in-progress cohort
                        {recentCohorts === 1 ? '' : 's'}{' '}
                        {recentCohorts === 1 ? "isn't" : "aren't"} counted in
                        the success rate — their horizon hasn't fully played
                        out yet.
                      </span>
                      <button onClick={() => setView('whereami')}>
                        View as “Where Am I” →
                      </button>
                    </div>
                  )}
                  <div className="spaghetti-row">
                    <SpaghettiChart
                      result={result}
                      overlay={snapshot?.result ?? null}
                      selectedYears={selectedYears}
                      onToggle={toggleYear}
                      onMarquee={marqueeYears}
                    />
                  </div>
                  <OutcomeStrip
                    result={result}
                    selectedYears={selectedYears}
                    onToggle={toggleYear}
                    onMarquee={marqueeYears}
                    onClear={clearSelection}
                  />
                  {detailYear != null && (() => {
                    const sim = result.sims.find(s => s.startYear === detailYear);
                    return sim ? (
                      <SimDetailPanel
                        sim={sim}
                        initialBalance={scenario.initialBalance}
                        onClose={() => setDetailYear(null)}
                      />
                    ) : null;
                  })()}
                </>
              )}
              {view === 'calendar' && (
                <CalendarHeatmap
                  result={result}
                  initialBalance={scenario.initialBalance}
                />
              )}
              {view === 'whereami' && (
                <>
                  <button
                    className="back-link"
                    onClick={() => setView('spaghetti')}
                  >
                    ← Back to spaghetti
                  </button>
                  <WhereAmI
                    result={result}
                    horizonYears={scenario.horizonYears}
                    initialBalance={scenario.initialBalance}
                    dataEnd={data.end}
                  />
                </>
              )}
              {view === 'spaghetti' && <Legend />}
            </>
            );
          })()}
          </>}
        </main>
      </div>
    </div>
  );
}
