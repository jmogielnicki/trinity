/**
 * CLI sim harness. `npm run sim -- --scenario=bengen-4pct` prints success
 * rate and lists any failing start years.
 */
import { runScenario } from '../src/engine/sweep';
import { loadHistoricalFromDisk } from '../tests/engine/loadData';

const SCENARIOS: Record<string, () => Parameters<typeof runScenario>[0]> = {
  'bengen-4pct': () => ({
    initialBalance: 1_000_000,
    horizonYears: 30,
    allocation: { type: 'static', weights: { stock: 0.5, bond: 0.5, cash: 0 } },
    withdrawal: { type: 'fixedPercent', rate: 0.04 },
    startYearRange: { from: 1926, to: 9999 },
  }),
  'trinity-4pct': () => ({
    initialBalance: 1_000_000,
    horizonYears: 30,
    allocation: {
      type: 'static',
      weights: { stock: 0.75, bond: 0.25, cash: 0 },
    },
    withdrawal: { type: 'fixedPercent', rate: 0.04 },
    startYearRange: { from: 1926, to: 9999 },
  }),
};

const arg = process.argv.find((a) => a.startsWith('--scenario='));
const name = arg?.split('=')[1] ?? 'bengen-4pct';
const factory = SCENARIOS[name];
if (!factory) {
  console.error(`Unknown scenario: ${name}. Known: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}
const data = loadHistoricalFromDisk();
const scenario = factory();
const cappedTo = Math.min(scenario.startYearRange!.to, data.end - scenario.horizonYears + 1);
scenario.startYearRange = { ...scenario.startYearRange!, to: cappedTo };
const r = runScenario(scenario, data);
console.log(`Scenario: ${name}`);
console.log(`Sims: ${r.sims.length} (completed: ${r.completedCount}, in-progress: ${r.inProgressCount})`);
console.log(`Success rate: ${(r.successRate * 100).toFixed(2)}%`);
const failures = r.sims.filter((s) => !s.success && !s.inProgress);
if (failures.length) {
  console.log(`Failures (${failures.length}):`);
  for (const f of failures) {
    console.log(`  ${f.startYear}: depleted at year ${f.depletedAt}`);
  }
}
