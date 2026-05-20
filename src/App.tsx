import { useEffect, useState } from 'react';import { AllocationEditor } from './components/controls/AllocationEditor';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { PresetPicker } from './components/controls/PresetPicker';
import { ScenarioLibrary } from './components/controls/ScenarioLibrary';
import { TailMethodInput } from './components/controls/TailMethodInput';
import { WithdrawalEditor } from './components/controls/WithdrawalEditor';
import { WithdrawalSourceInput } from './components/controls/WithdrawalSourceInput';
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
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
type View = 'spaghetti' | 'whereami';
type TopMode = 'single' | 'optimize' | 'evolve' | 'compare';

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
  const [view, setView] = useState<View>('spaghetti');
  const [topMode, setTopMode] = useState<TopMode>('single');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
    setSidebarOpen(false);
  }, [topMode]);

  // Lock body scroll when mobile sidebar tray or about modal is open.
  useEffect(() => {
    document.body.style.overflow = (sidebarOpen || aboutOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen, aboutOpen]);

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
    <div className="max-w-[1280px] mx-auto p-3 sm:p-6">
      <header>
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-[1.75rem] font-bold text-[var(--color-chart-blue)] m-0 mb-1">Historical Withdrawal Simulator</h1>
            <p className="m-0 mb-6 text-text-muted text-base">
              Stress-test against every retirement start year from{' '}
              {data?.start ?? '…'} to {data?.end ?? '…'}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className={`w-7 h-7 flex-shrink-0 rounded-full border border-text-disabled bg-surface cursor-pointer text-md font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover${aboutOpen ? ' bg-primary text-surface border-primary' : ''}`}
              onClick={() => setAboutOpen((v) => !v)}
              title="About / methodology"
            >
              ?
            </button>
          </div>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 bg-surface border border-border rounded-lg px-3 sm:px-4 py-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-text-faint">Context</span>
        <PortfolioInput />
        <span className="hidden sm:inline text-xs text-text-placeholder ml-auto">applies to every tab</span>
      </div>
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto scrollbar-none">
        <button
          className={`bg-transparent border-0 border-b-2 border-solid px-3.5 py-2 text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0${topMode === 'single' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('single')}
        >
          Single scenario
        </button>
        <button
          className={`bg-transparent border-0 border-b-2 border-solid px-3.5 py-2 text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0${topMode === 'optimize' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('optimize')}
        >
          Study / optimize
        </button>
        <button
          className={`bg-transparent border-0 border-b-2 border-solid px-3.5 py-2 text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0${topMode === 'evolve' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('evolve')}
        >
          Evolve
        </button>
        <button
          className={`bg-transparent border-0 border-b-2 border-solid px-3.5 py-2 text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0${topMode === 'compare' ? ' text-text font-medium border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent'}`}
          onClick={() => setTopMode('compare')}
        >
          Compare scenarios
        </button>
      </div>

      {/* Mobile drawer backdrop */}
      {topMode === 'single' && (
        <div
          className={`fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity duration-200${sidebarOpen ? ' opacity-100' : ' opacity-0 pointer-events-none'}`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`grid gap-4 sm:gap-6${topMode === 'single' ? ' md:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
        {topMode === 'single' && (
          <aside className={`fixed top-0 left-0 h-full w-[300px] z-50 overflow-y-auto transition-transform duration-200 ease-in-out md:static md:h-fit md:w-auto md:z-auto md:overflow-visible md:translate-x-0 flex flex-col gap-5 bg-surface border-r border-border-hover md:border md:rounded-lg p-4${sidebarOpen ? ' translate-x-0 shadow-popover' : ' -translate-x-full'}`}>
            {/* Close button — mobile only */}
            <div className="flex items-center justify-between pb-3 border-b border-border md:hidden">
              <span className="text-md font-bold text-text uppercase tracking-[0.05em]">Strategy</span>
              <button
                className="w-7 h-7 flex items-center justify-center rounded cursor-pointer text-text-muted hover:bg-surface-hover border border-border text-base"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
            <section className="control-zone flex flex-col gap-5">
              <div className="hidden md:flex flex-col gap-0.5">
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
        <main className="bg-surface border border-border rounded-lg p-4 min-w-0">
          {topMode === 'single' && (
            <button
              className="md:hidden flex items-center gap-2 text-sm px-3 py-2 border border-border rounded-lg cursor-pointer bg-surface hover:bg-surface-hover mb-3 text-text-secondary"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Strategy
            </button>
          )}
          {topMode === 'optimize' && (
            <FrontierView onApplied={() => setTopMode('single')} />
          )}
          {topMode === 'evolve' && <EvolveView />}
          {topMode === 'compare' && <CompareScenariosView />}
          {topMode === 'single' && <>
          {!data && <div className="text-text-faint text-base">Loading historical data…</div>}
          {data && (
            <div className="text-xs text-text-placeholder mb-2">
              Compute: {computeMs.toFixed(0)} ms{computing ? ' …' : ''}
              {pool && <span className="text-text-placeholder"> ({pool.size} workers)</span>}
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
                        className="flex-shrink-0 text-sm py-[5px] px-2.5 border border-border-hover bg-surface text-primary rounded cursor-pointer hover:bg-surface-panel"
                        onClick={() => setView('whereami')}
                      >
                        View as "Where Am I" →
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="min-w-0">
                      <SpaghettiChart
                        result={result}
                        overlay={null}
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

      {/* About modal */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAboutOpen(false)} />
          <div className="relative bg-surface rounded-lg shadow-popover w-full max-w-[720px] max-h-[85vh] overflow-y-auto p-5 sm:p-7">
            <button
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded cursor-pointer text-text-muted hover:bg-surface-hover border border-border text-base"
              onClick={() => setAboutOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
            <AboutPanel />
          </div>
        </div>
      )}
    </div>
  );
}
