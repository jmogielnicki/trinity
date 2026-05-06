import { useEffect } from 'react';
import { AllocationInput } from './components/controls/AllocationInput';
import { PortfolioInput } from './components/controls/PortfolioInput';
import { WithdrawalInput } from './components/controls/WithdrawalInput';
import { SpaghettiChart } from './components/results/SpaghettiChart';
import { StatPanel } from './components/results/StatPanel';
import { loadHistorical } from './data/load';
import { useResultsStore } from './store/resultsStore';
import { useScenarioStore } from './store/scenarioStore';
import './App.css';

export function App() {
  const scenario = useScenarioStore();
  const { data, result, setData, recompute } = useResultsStore();

  useEffect(() => {
    loadHistorical().then(setData);
  }, [setData]);

  useEffect(() => {
    if (!data) return;
    const id = setTimeout(() => recompute(scenario), 100);
    return () => clearTimeout(id);
  }, [
    data,
    scenario.initialBalance,
    scenario.horizonYears,
    scenario.weights,
    scenario.withdrawalRate,
    recompute,
    scenario,
  ]);

  return (
    <div className="app">
      <header>
        <h1>Historical Withdrawal Simulator</h1>
        <p className="subtitle">
          Stress-test a withdrawal strategy against every retirement start year
          from {data?.start ?? '…'} to {data?.end ?? '…'}.
        </p>
      </header>
      <div className="layout">
        <aside className="controls">
          <PortfolioInput />
          <AllocationInput />
          <WithdrawalInput />
        </aside>
        <main className="results">
          {!data && <div className="loading">Loading historical data…</div>}
          {data && result && (
            <>
              <StatPanel result={result} />
              <SpaghettiChart result={result} />
              <p className="note">
                Each line = one historical start year played forward {scenario.horizonYears} years.
                Red lines failed; gray lines are in-progress (data ran out).
                All amounts in real dollars.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
