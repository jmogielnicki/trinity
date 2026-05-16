import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AllocationEditor } from './components/controls/AllocationEditor';
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
import { HeroCard } from './components/results/HeroCard';
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
import { CompareScenariosView } from './components/compare/CompareScenariosView';
import { loadHistorical } from './data/load';
import { gateCustomSrc, serialize, tryDeserialize } from './data/urlState';
import { useCompareStore } from './store/compareStore';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import { createPool } from './worker/pool';
import './App.css';

type View = 'spaghetti' | 'calendar' | 'whereami' | 'sleeves';
type TopMode = 'single' | 'optimize' | 'evolve' | 'compare';

const CHART_TITLES: Record<View, { lead: string; em: string; sub: string }> = {
  spaghetti: {
    lead: 'Outcome ',
    em: 'envelope',
    sub: 'Every historical start year as a trajectory. Red lines are failing cohorts.',
  },
  calendar: {
    lead: 'Calendar of ',
    em: 'cohorts',
    sub: 'Every retirement start year, colored by portfolio balance over time.',
  },
  whereami: {
    lead: 'Where am ',
    em: 'I?',
    sub: 'Recent in-progress retirees against the historical percentile band.',
  },
  sleeves: {
    lead: 'Asset ',
    em: 'sleeves',
    sub: 'Stocks / bonds / cash mix across cohorts over the horizon.',
  },
};

function StepHead({
  n,
  color,
  title,
  desc,
}: {
  n: number;
  color: 'a' | 'b' | 'c' | 'd';
  title: string;
  desc: string;
}) {
  return (
    <div className="step-head">
      <div className={`step-num ${color}`}>{n}</div>
      <div>
        <div className="step-title">{title}</div>
        <div className="step-desc">{desc}</div>
      </div>
    </div>
  );
}

function TopBar({ workers }: { workers: number | null }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">h</div>
        <div className="brand-name">
          Historical <em>Withdrawal</em> Simulator
        </div>
      </div>
      <div className="top-actions">
        <div className="pill-status">
          <span className="dot" />
          {workers ? `Live · ${workers} workers` : 'Loading…'}
        </div>
      </div>
    </div>
  );
}

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
  const chart = CHART_TITLES[view];

  const viewTabs: Array<{ k: View; label: string }> = [
    { k: 'spaghetti', label: 'spaghetti' },
    { k: 'calendar', label: 'calendar' },
    { k: 'whereami', label: 'where am i' },
    { k: 'sleeves', label: 'sleeves' },
  ];

  let chartBody: ReactNode = null;
  if (data && result && !showSweepViews) {
    if (view === 'spaghetti') {
      chartBody = (
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
          <Legend />
        </>
      );
    } else if (view === 'calendar') {
      chartBody = (
        <CalendarHeatmap
          result={result}
          initialBalance={scenario.initialBalance}
        />
      );
    } else if (view === 'whereami') {
      chartBody = (
        <WhereAmI
          result={result}
          horizonYears={scenario.horizonYears}
          initialBalance={scenario.initialBalance}
          dataEnd={data.end}
        />
      );
    } else {
      chartBody = (
        <SleeveChart result={result} selectedYears={selectedYears} />
      );
    }
  }

  return (
    <div className="app">
      <TopBar workers={pool?.size ?? null} />

      <aside className="sidebar">
        <div className="side-header">
          <h1>
            Historical <em>withdrawal</em> simulator
          </h1>
          <p>
            Stress-test against every retirement start year from{' '}
            {data?.start ?? '…'} to {data?.end ?? '…'}.
          </p>
        </div>

        <div className="group">
          <StepHead
            n={1}
            color="a"
            title="Starting point"
            desc="Pick a historical preset or set your own numbers."
          />
          <PresetPicker />
          <PortfolioInput />
        </div>

        <div className="group">
          <StepHead
            n={2}
            color="b"
            title="Glide path"
            desc="Shape the stocks / bonds / cash mix over the horizon."
          />
          <AllocationEditor
            horizonYears={scenario.horizonYears}
            allocation={scenario.allocation}
            onChange={scenario.setAllocation}
          />
        </div>

        <div className="group">
          <StepHead
            n={3}
            color="c"
            title="Withdrawal plan"
            desc="Shape spending over time and choose where it is drawn from."
          />
          <WithdrawalEditor
            horizonYears={scenario.horizonYears}
            withdrawal={scenario.withdrawal}
            onChange={scenario.setWithdrawal}
          />
          <WithdrawalSourceInput />
        </div>

        <div className="group">
          <StepHead
            n={4}
            color="d"
            title="Sweeps & data"
            desc="Vary parameters, handle partial data, save and share."
          />
          <TailMethodInput />
          <SweepSelector />
          <ScenarioActions />
          <ScenarioLibrary />
        </div>

        <button
          className="run-cta"
          disabled={computing || !data || !pool}
          onClick={() => void recompute(scenario, sweep)}
        >
          {computing ? 'Running…' : 'Re-run simulation'}
        </button>

        <div className="footnote">
          Data: Shiller real returns, {data?.start ?? '1871'}–
          {data?.end ?? 'present'}. All amounts pre-tax, in today's dollars.
        </div>
      </aside>

      <main className="canvas">
        <div className="tabs">
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
          <button
            className={topMode === 'compare' ? 'active' : ''}
            onClick={() => setTopMode('compare')}
          >
            Compare scenarios
          </button>
        </div>

        {topMode === 'optimize' && <FrontierView />}
        {topMode === 'evolve' && <EvolveView />}
        {topMode === 'compare' && <CompareScenariosView />}

        {topMode === 'single' && (
          <div className="results">
            {!data && (
              <div className="loading">Loading historical data…</div>
            )}
            {data && (
              <div className="compute-meta">
                compute: {computeMs.toFixed(0)} ms{computing ? ' …' : ''}
                {pool && (
                  <span className="pool-meta">· {pool.size} workers</span>
                )}
              </div>
            )}

            {data && result && !showSweepViews && (
              <>
                <div className="hero-grid">
                  <HeroCard
                    result={result}
                    horizonYears={scenario.horizonYears}
                  />
                  <StatPanel result={result} />
                </div>

                <div className="chart-card">
                  <div className="chart-head">
                    <div>
                      <div className="chart-title">
                        {chart.lead}
                        <em>{chart.em}</em>
                      </div>
                      <div className="step-desc" style={{ maxWidth: '60ch' }}>
                        {chart.sub}
                      </div>
                    </div>
                    <div className="chart-tools">
                      <div className="seg">
                        {viewTabs.map((t) => (
                          <button
                            key={t.k}
                            className={view === t.k ? 'active' : ''}
                            onClick={() => setView(t.k)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {chartBody}
                </div>
              </>
            )}

            {data && grid && grid.axes.length === 1 && (
              <SmallMultiples grid={grid} />
            )}
            {data && grid && grid.axes.length === 2 && <Heatmap grid={grid} />}
          </div>
        )}
      </main>
    </div>
  );
}
