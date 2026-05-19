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
import { StartYearChart } from './components/results/StartYearChart';
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

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.size === 1 && prev.has(year) ? new Set() : new Set([year]),
    );
  };
  const marqueeYears = (years: number[]) => {
    setSelectedYears(new Set(years));
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
    <div className="max-w-[1280px] mx-auto p-6">
      <header>
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1>Historical Withdrawal Simulator</h1>
            <p className="m-0 mb-6 text-text-muted text-base">
              Stress-test against every retirement start year from{' '}
              {data?.start ?? '…'} to {data?.end ?? '…'}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScenarioActions />
            <button
              className={`w-7 h-7 flex-shrink-0 rounded-full border border-text-disabled bg-surface cursor-pointer text-md font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover${topMode === 'about' ? ' bg-primary text-surface border-primary' : ''}`}
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
      <div className="flex items-center gap-5 bg-surface border border-border rounded-lg px-4 py-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-text-faint">Context</span>
        <PortfolioInput />
        <span className="text-xs text-text-placeholder ml-auto">applies to every tab</span>
      </div>
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          className={`bg-transparent border-none px-[14px] py-2 text-base cursor-pointer border-b-2 -mb-px${topMode === 'single' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('single')}
        >
          Single scenario
        </button>
        <button
          className={`bg-transparent border-none px-[14px] py-2 text-base cursor-pointer border-b-2 -mb-px${topMode === 'optimize' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('optimize')}
        >
          Study / optimize
        </button>
        <button
          className={`bg-transparent border-none px-[14px] py-2 text-base cursor-pointer border-b-2 -mb-px${topMode === 'evolve' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('evolve')}
        >
          Evolve
        </button>
        <button
          className={`bg-transparent border-none px-[14px] py-2 text-base cursor-pointer border-b-2 -mb-px${topMode === 'compare' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('compare')}
        >
          Compare scenarios
        </button>
      </div>
      <div className={`grid gap-6${topMode === 'single' ? ' grid-cols-[280px_minmax(0,1fr)]' : ' grid-cols-[minmax(0,1fr)]'}`}>
        {topMode === 'single' && (
          <aside className="flex flex-col gap-5 bg-surface border border-border rounded-lg p-4 h-fit">
            <section className="control-zone flex flex-col gap-5">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-md font-bold text-text uppercase tracking-[0.05em]">Strategy</h2>
              </div>
              <PresetPicker />
              <h3 className="mt-1 text-base font-bold text-text tracking-[0.01em] border-b border-border pb-1">Holdings mix</h3>
              <AllocationEditor
                horizonYears={scenario.horizonYears}
                allocation={scenario.allocation}
                onChange={scenario.setAllocation}
              />
              <h3 className="mt-1 text-base font-bold text-text tracking-[0.01em] border-b border-border pb-1">Withdrawal strategy</h3>
              <WithdrawalEditor
                horizonYears={scenario.horizonYears}
                withdrawal={scenario.withdrawal}
                onChange={scenario.setWithdrawal}
              />
              <h3 className="mt-1 text-base font-bold text-text tracking-[0.01em] border-b border-border pb-1">Withdrawal source</h3>
              <WithdrawalSourceInput />
              <TailMethodInput />
            </section>
            <ScenarioLibrary />
          </aside>
        )}
        <main className="bg-surface border border-border rounded-lg p-4">
          {topMode === 'optimize' && (
            <FrontierView onApplied={() => setTopMode('single')} />
          )}
          {topMode === 'evolve' && <EvolveView />}
          {topMode === 'compare' && <CompareScenariosView />}
          {topMode === 'about' && <AboutPanel />}
          {topMode === 'single' && <>
          {!data && <div className="text-text-faint text-base">Loading historical data…</div>}
          {data && (
            <div className="text-xs text-text-placeholder mb-2">
              Compute: {computeMs.toFixed(0)} ms{computing ? ' …' : ''}
              {pool && <span className="text-text-placeholder"> ({pool.size} workers)</span>}
              {result && (
                <span className="ml-3">
                  view:
                  <button
                    className={`text-xs px-2 py-[2px] border rounded-[3px] cursor-pointer ml-1${view === 'spaghetti' || view === 'whereami' ? ' bg-primary text-surface border-primary' : ' bg-surface border-text-disabled text-text-placeholder'}`}
                    onClick={() => setView('spaghetti')}
                  >
                    spaghetti
                  </button>
                  <button
                    className={`text-xs px-2 py-[2px] border rounded-[3px] cursor-pointer ml-1${view === 'calendar' ? ' bg-primary text-surface border-primary' : ' bg-surface border-text-disabled text-text-placeholder'}`}
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
                    <div className="flex items-center justify-between gap-3 flex-wrap bg-surface-panel border border-border rounded-md px-3 py-2 text-sm text-text-body mb-3">
                      <span>
                        {recentCohorts} in-progress cohort
                        {recentCohorts === 1 ? '' : 's'}{' '}
                        {recentCohorts === 1 ? "isn't" : "aren't"} counted in
                        the success rate — their horizon hasn't fully played
                        out yet.
                      </span>
                      <button
                        className="flex-shrink-0 text-sm py-[5px] px-[10px] border border-border-hover bg-surface text-primary rounded cursor-pointer hover:bg-surface-panel"
                        onClick={() => setView('whereami')}
                      >
                        View as "Where Am I" →
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="min-w-0">
                      <SpaghettiChart
                        result={result}
                        overlay={snapshot?.result ?? null}
                        selectedYears={selectedYears}
                        onToggle={toggleYear}
                        onMarquee={marqueeYears}
                        onClear={clearSelection}
                        height={400}
                      />
                    </div>
                    <div className="min-w-0">
                      <StartYearChart
                        result={result}
                        initialBalance={scenario.initialBalance}
                        height={400}
                        selectedYears={selectedYears}
                        onToggle={toggleYear}
                        onMarquee={marqueeYears}
                      />
                    </div>
                  </div>
                  {selectedYears.size > 0 && (
                    [...selectedYears].sort((a, b) => a - b).map((year) => {
                      const sim = result.sims.find(s => s.startYear === year);
                      return sim ? (
                        <SimDetailPanel
                          key={year}
                          sim={sim}
                          initialBalance={scenario.initialBalance}
                          onClose={() => toggleYear(year)}
                        />
                      ) : null;
                    })
                  )}
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
                    className="border-none bg-transparent text-primary text-sm cursor-pointer pb-2 hover:underline"
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
