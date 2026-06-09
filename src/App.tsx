import { useEffect, useRef, useState } from 'react';import { AllocationEditor } from './components/controls/AllocationEditor';
import { IncomeInput } from './components/controls/IncomeInput';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { PresetPicker } from './components/controls/PresetPicker';
import { WithdrawalEditor } from './components/controls/WithdrawalEditor';
import { WithdrawalSourceInput } from './components/controls/WithdrawalSourceInput';
import { SimDetailPanel } from './components/results/SimDetailPanel';
import { Legend } from './components/results/Legend';
import { StartYearChart } from './components/results/StartYearChart';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { QuickSelectYears } from './components/results/QuickSelectYears';
import { FrontierView } from './components/optimize/FrontierView';
import { CompareScenariosView } from './components/compare/CompareScenariosView';
import { AboutPanel } from './components/AboutPanel';
import { AuthControl } from './components/auth/AuthControl';
import { ProGate } from './components/auth/ProGate';
import { SaveScenarioModal } from './components/SaveScenarioModal';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { IconButton } from './components/ui/IconButton';
import { NavTab } from './components/ui/NavTab';
import { authConfigured } from './auth';
import { loadHistorical } from './data/load';
import { gateCustomSrc, serialize, tryDeserialize } from './data/urlState';
import { useAuthStore } from './store/authStore';
import { useCompareScenariosStore } from './store/compareScenariosStore';
import { useOptimizeStore } from './store/optimizeStore';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
type TopMode = 'single' | 'optimize' | 'compare';

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
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus);
  // Gate the advanced tabs only when auth is actually configured — an
  // unprovisioned build (no Neon env) stays fully open, like before.
  // VITE_DISABLE_PRO_GATE force-opens them regardless; set it on Vercel
  // Preview deploys so testing doesn't require sign-in (never set in prod).
  const proGated =
    authConfigured &&
    subscriptionStatus !== 'pro' &&
    !import.meta.env.VITE_DISABLE_PRO_GATE;

  // Per-tab state read for URL sync.
  const compareSelectedIds = useCompareScenariosStore((s) => s.selectedIds);
  const optimizeStudy = useOptimizeStore((s) => s.study);
  const optimizeHasBase = useOptimizeStore((s) => s.hasBase);
  const optimizeBaseLabel = useOptimizeStore((s) => s.baseLabel);
  const optimizeBasePickerKey = useOptimizeStore((s) => s.basePickerKey);
  const optimizeMinSuccessRate = useOptimizeStore((s) => s.minSuccessRate);

  const [topMode, setTopMode] = useState<TopMode>('single');
  const tabBarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(true);

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

  // Lock body scroll when mobile sidebar tray or any modal is open.
  useEffect(() => {
    document.body.style.overflow = (sidebarOpen || aboutOpen || saveOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen, aboutOpen, saveOpen]);

  // Collapse FAB when scrolling down, expand when scrolling up or at top.
  // Threshold prevents jitter from momentum-scroll micro-reversals.
  useEffect(() => {
    let lastY = window.scrollY;
    const THRESHOLD = 10;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 10) { setFabExpanded(true); lastY = y; return; }
      const delta = y - lastY;
      if (Math.abs(delta) >= THRESHOLD) {
        setFabExpanded(delta < 0);
        lastY = y;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  // Returning from Stripe Checkout: re-read entitlement (the webhook may have
  // just flipped the user to 'pro') and strip the marker from the URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('upgrade')) return;
    void useAuthStore.getState().refresh();
    params.delete('upgrade');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }, []);

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
    if (parsed.incomes) scenario.setIncomes(parsed.incomes);
    if (parsed.cashflows) scenario.setCashflows(parsed.cashflows);
    if (parsed.retireAge != null) scenario.setRetireAge(parsed.retireAge);
    (Object.keys(parsed.axes) as Array<keyof typeof parsed.axes>).forEach((a) =>
      sweep.setAxis(a, parsed.axes[a]),
    );

    // Restore active tab.
    if (parsed.tab) setTopMode(parsed.tab);

    // Restore compare tab selection.
    if (parsed.compareSelectedIds?.length) {
      useCompareScenariosStore.getState().setSelection(parsed.compareSelectedIds);
    }

    // Restore optimize tab state.
    if (parsed.optimizeStudy) {
      useOptimizeStore.setState({
        study: parsed.optimizeStudy,
        studyDirty: true,
        hasBase: true,
        baseLabel: parsed.optimizeBaseLabel ?? null,
        basePickerKey: parsed.optimizeBasePickerKey ?? null,
      });
    }
    if (parsed.optimizeMinSuccessRate != null) {
      useOptimizeStore.getState().setMinSuccessRate(parsed.optimizeMinSuccessRate);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state to URL hash so shared links and page refreshes restore the exact view.
  useEffect(() => {
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
      tab: topMode,
      ...(compareSelectedIds.length > 0 && { compareSelectedIds }),
      ...(optimizeHasBase && {
        optimizeStudy,
        optimizeBaseLabel,
        optimizeBasePickerKey,
        ...(optimizeMinSuccessRate > 0 && { optimizeMinSuccessRate }),
      }),
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
    scenario.incomes,
    scenario.cashflows,
    scenario.retireAge,
    sweep.axes,
    compareSelectedIds,
    optimizeStudy,
    optimizeHasBase,
    optimizeBaseLabel,
    optimizeBasePickerKey,
    optimizeMinSuccessRate,
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
    scenario.incomes,
    scenario.cashflows,
    scenario.tailMethod,
    sweep.axes,
    recompute,
    scenario,
    sweep,
  ]);

  // Scroll-linked header collapse. The collapse value `--scroll-p` is eased
  // toward its target inside a single rAF loop rather than written instantly,
  // and the CSS carries NO transitions on scroll-p-derived properties. This
  // keeps the (in-flow) header height and the content laid out below it on one
  // timeline — both read the same --scroll-p in the same frame, so they move as
  // a rigid unit instead of desyncing into jitter. The easing also spreads a
  // large discrete wheel jump over a few frames so the collapse never snaps.
  useEffect(() => {
    // 35px is the largest range that stays jitter-free (a smaller range
    // amplifies the scroll-anchoring feedback from the in-flow header resizing).
    // The tab bar's top margin (mt-10 = 40px) is kept wider than this so the
    // header finishes collapsing before the tabs below begin tucking under it.
    const SCROLL_RANGE = 35;
    const EASE = 0.3; // fraction of remaining distance closed per frame
    const root = document.documentElement;
    const clamp = () => Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE));
    let current = clamp();
    let target = current;
    let raf = 0;
    const write = (p: number) => {
      root.style.setProperty('--scroll-p', String(p));
      root.classList.toggle('header-collapsed', p > 0.45);
    };
    const tick = () => {
      const diff = target - current;
      current = Math.abs(diff) < 0.001 ? target : current + diff * EASE;
      write(current);
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      target = clamp();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    write(current);
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Prevent the overflow-x tab bar from stealing vertical trackpad/touch scrolls.
  // React's onWheel is passive so preventDefault() is silently ignored there;
  // we need a direct DOM listener registered with { passive: false }.
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Publish the sticky header's live height as --header-h so descendant sticky
  // elements (e.g. the compare-tab legend bar) can pin themselves directly below
  // it. The header's height is scroll-driven and collapses as you scroll, so a
  // ResizeObserver keeps the value in sync frame-by-frame.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const write = () =>
      document.documentElement.style.setProperty(
        '--header-h',
        `${el.getBoundingClientRect().height}px`,
      );
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      {/* ── Shrinking sticky header shell ── */}
      <div ref={headerRef} className="sticky top-0 z-30 bg-surface-page/85 backdrop-blur-md border-b border-border shadow-sticky">
        <div className="max-w-[1200px] mx-auto px-3 sm:px-6">
          {/* Title row — height + h1 font-size driven by .shrinking-title-box CSS */}
          <div className="shrinking-title-box">
            <div className="min-w-0 md:relative flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex-shrink-0 flex items-center justify-center rounded-xl bg-primary text-white font-display font-bold w-9 h-9 text-lg leading-none select-none"
              >
                ↟
              </span>
              <div className="min-w-0 flex flex-col justify-center gap-1">
              <h1 className="font-display font-bold text-primary m-0">
                Retirement Planner
              </h1>
              <p className="shrinking-subtitle text-text-muted text-base">
                Build your retirement plan. Stress-test against historical returns.
              </p>
              </div>
            </div>
            <div className="hidden md:flex items-center title-portfolio flex-1 ml-4">
              <PortfolioInput />
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {topMode === 'single' && (
                <div className="hidden md:block">
                  <Button size="md" onClick={() => setSaveOpen(true)} title="Save plan">
                    Save plan
                  </Button>
                </div>
              )}
              <AuthControl />
              <button
                className={`w-9 h-9 flex-shrink-0 rounded-full border border-border-strong bg-surface cursor-pointer text-md font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover${aboutOpen ? ' bg-primary text-surface border-primary' : ''}`}
                onClick={() => setAboutOpen((v) => !v)}
                title="About / methodology"
              >
                ?
              </button>
            </div>
          </div>
          {/* Context row — collapses to zero on desktop (pills migrate to title row); collapses to pills on mobile */}
          <div className="shrinking-context-bar">
            <PortfolioInput />
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 pb-3 sm:pb-6">
        <div
          ref={tabBarRef}
          className="flex gap-1 mt-10 mb-4 border-b border-border overflow-x-auto scrollbar-none overscroll-x-contain"
        >
          <NavTab active={topMode === 'single'} onClick={() => setTopMode('single')}>
            <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l5-5 4 4 5-7 4 4" />
            </svg>
            Build plan
          </NavTab>
          <NavTab active={topMode === 'compare'} onClick={() => setTopMode('compare')}>
            <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Compare plans
          </NavTab>
          <NavTab active={topMode === 'optimize'} onClick={() => setTopMode('optimize')}>
            <svg className="hidden sm:block w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Optimize plans
          </NavTab>
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
            <aside className={`fixed top-0 left-0 h-full w-[300px] z-50 overflow-y-auto transition-transform duration-200 ease-in-out md:static md:h-fit md:w-auto md:z-auto md:overflow-visible md:translate-x-0 flex flex-col gap-5 bg-surface border-r border-border md:border md:rounded-lg md:shadow-card p-4${sidebarOpen ? ' translate-x-0 shadow-popover' : ' -translate-x-full'}`}>
              {/* Close button — mobile only */}
              <div className="flex items-center justify-between pb-3 border-b border-border md:hidden">
                <span className="text-md font-bold text-text uppercase tracking-[0.05em]">Plan</span>
                <IconButton onClick={() => setSidebarOpen(false)} aria-label="Close panel">✕</IconButton>
              </div>
              <section className="control-zone flex flex-col gap-5">
                <div className="hidden md:flex flex-col gap-0.5">
                  <span className="text-2xs font-semibold text-text-faint uppercase tracking-[0.14em]">Plan</span>
                  <h2 className="font-display m-0 text-xl font-bold text-text">Build your plan</h2>
                </div>
                <PresetPicker />
                <h3 className="font-display mt-1 text-lg font-bold text-text border-b border-border pb-1.5">Allocation</h3>
                <AllocationEditor
                  horizonYears={scenario.horizonYears}
                  allocation={scenario.allocation}
                  onChange={scenario.setAllocation}
                />
                <h3 className="font-display mt-1 text-lg font-bold text-text border-b border-border pb-1.5">Withdrawal strategy</h3>
                <WithdrawalEditor
                  horizonYears={scenario.horizonYears}
                  withdrawal={scenario.withdrawal}
                  onChange={scenario.setWithdrawal}
                />
                <h3 className="font-display mt-1 text-lg font-bold text-text border-b border-border pb-1.5">Withdrawal source</h3>
                <WithdrawalSourceInput hideLabel/>
                <h3 className="font-display mt-1 text-lg font-bold text-text border-b border-border pb-1.5">Income &amp; one-time events</h3>
                <IncomeInput />
              </section>
              {/* Desktop save button — sticky footer */}
              <div className="hidden md:block border-t border-border pt-4 mt-1">
                <Button variant="soft" size="lg" fullWidth onClick={() => setSaveOpen(true)}>
                  Save plan
                </Button>
              </div>
            </aside>
          )}
          <section className="min-w-0 flex flex-col gap-4 sm:gap-5">
            {/* Split FAB — mobile only. Left: edit strategy. Right: save strategy.
                Text labels collapse when scrolling down (Gmail compose pattern). */}
            {topMode === 'single' && (
              <div className="md:hidden fixed bottom-6 right-3 z-40 h-14 flex rounded-2xl overflow-hidden shadow-fab">
                {/* Edit half */}
                <button
                  className="flex items-center px-4 bg-secondary cursor-pointer hover:opacity-90 active:opacity-80 text-white h-full"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Edit plan"
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
                  </svg>
                  <span
                    className="whitespace-nowrap text-md font-medium overflow-hidden pl-2"
                    style={{
                      maxWidth: fabExpanded ? '6rem' : '0',
                      opacity: fabExpanded ? 1 : 0,
                      transition: 'max-width 300ms ease-in-out, opacity 200ms ease-in-out',
                    }}
                  >
                    edit
                  </span>
                </button>

                {/* Divider */}
                <div className="w-px bg-white/30 self-stretch" />

                {/* Save half */}
                <button
                  className="flex items-center px-4 bg-secondary cursor-pointer hover:opacity-90 active:opacity-80 text-white h-full"
                  onClick={() => setSaveOpen(true)}
                  aria-label="Save plan"
                >
                  <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                  </svg>
                  <span
                    className="whitespace-nowrap text-md font-medium overflow-hidden pl-2"
                    style={{
                      maxWidth: fabExpanded ? '6rem' : '0',
                      opacity: fabExpanded ? 1 : 0,
                      transition: 'max-width 300ms ease-in-out, opacity 200ms ease-in-out',
                    }}
                  >
                    save
                  </span>
                </button>
              </div>
            )}
            {topMode === 'optimize' && (
              <Card variant="elevated">
                {proGated ? (
                  <ProGate
                    title="Optimize plans"
                    blurb="Sweep allocation and withdrawal strategies across every historical start year and compare them on a Pareto frontier. Available with Pro."
                  />
                ) : (
                  <FrontierView onApplied={() => setTopMode('single')} />
                )}
              </Card>
            )}
            {topMode === 'compare' && (
              <Card variant="elevated" style={{ background: 'var(--color-surface-1)' }}>
                <CompareScenariosView />
              </Card>
            )}
            {topMode === 'single' && <>
            {!data && (
              <Card variant="elevated">
                <div className="text-text-faint text-base">Loading historical data…</div>
              </Card>
            )}
            {data && result && (
              <>
                {/* Hero — headline success + key stats */}
                <Card variant="elevated">
                  <StatPanel result={result} />
                </Card>
                {/* Charts */}
                <Card variant="elevated" className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 min-[1000px]:grid-cols-2 gap-4 items-start">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold text-text mb-2">Portfolio balance over time</h3>
                      <SpaghettiChart
                        result={result}
                        overlay={null}
                        selectedYears={selectedYears}
                        onToggle={toggleYear}
                        onMarquee={marqueeYears}
                        onClear={clearSelection}
                        height={320}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold text-text mb-2">Spending and final balance by retirement start year (real $)</h3>
                      <StartYearChart
                        result={result}
                        initialBalance={scenario.initialBalance}
                        height={320}
                        selectedYears={selectedYears}
                        onToggle={toggleYear}
                        onMarquee={marqueeYears}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border pt-3 flex flex-col gap-3">
                    <QuickSelectYears
                      result={result}
                      selectedYears={selectedYears}
                      onSelect={(year, alreadySelected) =>
                        alreadySelected ? clearSelection() : marqueeYears([year])
                      }
                    />
                    <Legend />
                  </div>
                </Card>
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
            </>}
          </section>
        </div>
      </div>

      {saveOpen && <SaveScenarioModal onClose={() => setSaveOpen(false)} />}

      {/* About modal */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAboutOpen(false)} />
          <div className="relative bg-surface rounded-lg shadow-popover w-full max-w-[720px] max-h-[85vh] overflow-y-auto p-5 sm:p-7">
            <IconButton onClick={() => setAboutOpen(false)} aria-label="Close" className="absolute top-3 right-3">✕</IconButton>
            <AboutPanel />
          </div>
        </div>
      )}
    </div>
  );
}
