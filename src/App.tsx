import { useEffect } from 'react';
import { GlidePath } from './components/controls/GlidePath';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { SweepSelector } from './components/controls/SweepSelector';
import { WithdrawalCurve } from './components/controls/WithdrawalCurve';
import { Heatmap } from './components/results/Heatmap';
import { SmallMultiples } from './components/results/SmallMultiples';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { loadHistorical } from './data/load';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import { useSweepStore } from './store/sweepStore';
import './App.css';

export function App() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const { data, result, grid, computeMs, setData, recompute } =
    useResultsStore();

  useEffect(() => {
    loadHistorical().then(setData);
  }, [setData]);

  useEffect(() => {
    if (!data) return;
    const id = setTimeout(() => recompute(scenario, sweep), 150);
    return () => clearTimeout(id);
  }, [
    data,
    scenario.initialBalance,
    scenario.horizonYears,
    scenario.allocation,
    scenario.withdrawal,
    sweep.axes,
    recompute,
    scenario,
    sweep,
  ]);

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
          <WithdrawalCurve
            horizonYears={scenario.horizonYears}
            withdrawal={scenario.withdrawal}
            onChange={scenario.setWithdrawal}
          />
          <SweepSelector />
        </aside>
        <main className="results">
          {!data && <div className="loading">Loading historical data…</div>}
          {data && (
            <div className="compute-meta">
              Compute: {computeMs.toFixed(0)} ms
            </div>
          )}
          {data && result && (
            <>
              <StatPanel result={result} />
              <SpaghettiChart result={result} />
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
