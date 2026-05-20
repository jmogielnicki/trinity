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
type TopMode = 'single' | 'optimize' | 'evolve' | 'compare';

export function App() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const {
    data,
    result,
    pool,
    setData,
    setPool,
    recompute,
  } = useResultsStore();
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
      <header className="sticky sm:static top-0 z-30 sm:z-auto bg-[var(--color-surface,#fff)] sm:bg-transparent -mx-3 sm:mx-0 px-3 sm:px-0 py-2 sm:py-0 shadow-sticky sm:shadow-none mb-3 sm:mb-0">
        <div className="flex justify-between items-center sm:items-start gap-4">
          <div>
            <h1 className="text-xl sm:text-[1.75rem] font-bold text-[var(--color-chart-blue)] m-0 sm:mb-1">Historical Withdrawal Simulator</h1>
            <p className="hidden sm:block m-0 mb-4 text-text-muted text-base">
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
      </div>
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto scrollbar-none">
        <button
          className={`bg-transparent border-0 border-b-[3px] border-solid px-2 py-1.5 sm:px-3.5 sm:py-2 text-sm sm:text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-1.5${topMode === 'single' ? ' text-[var(--color-chart-blue)] font-semibold border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent hover:text-text'}`}
          onClick={() => setTopMode('single')}
        >
          <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l5-5 4 4 5-7 4 4" />
          </svg>
          Single scenario
        </button>
        <button
          className={`bg-transparent border-0 border-b-[3px] border-solid px-2 py-1.5 sm:px-3.5 sm:py-2 text-sm sm:text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-1.5${topMode === 'optimize' ? ' text-[var(--color-chart-blue)] font-semibold border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent hover:text-text'}`}
          onClick={() => setTopMode('optimize')}
        >
          <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          Study / optimize
        </button>
        <button
          className={`bg-transparent border-0 border-b-[3px] border-solid px-2 py-1.5 sm:px-3.5 sm:py-2 text-sm sm:text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-1.5${topMode === 'evolve' ? ' text-[var(--color-chart-blue)] font-semibold border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent hover:text-text'}`}
          onClick={() => setTopMode('evolve')}
        >
          <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Evolve
        </button>
        <button
          className={`bg-transparent border-0 border-b-[3px] border-solid px-2 py-1.5 sm:px-3.5 sm:py-2 text-sm sm:text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-1.5${topMode === 'compare' ? ' text-[var(--color-chart-blue)] font-semibold border-b-[var(--color-chart-blue)]' : ' text-text-muted border-b-transparent hover:text-text'}`}
          onClick={() => setTopMode('compare')}
        >
          <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
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
          {data && result && (
            <>
              <StatPanel result={result} />
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
              <Legend />
            </>
          )}
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
