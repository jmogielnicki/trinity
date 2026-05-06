# Follow-ups

Things deliberately deferred. Each one has a phase or trigger that should bring it back into scope.

## Data

- **Cash returns are `null`** for every year. Need FRED `TB3MS` (3-month T-bill, 1934+) to populate `cash_return_*`. Until then, any allocation with a cash sleeve has the cash weight silently dropped and the remaining weights renormalized in `simulate.ts`. Revisit when egress to FRED is available or someone drops a TB3MS CSV into the repo.
- **Data ends 2022.** The `datasets/s-and-p-500` GitHub mirror only has complete columns through Sept 2023, so 2023–2025 are excluded. To extend through 2025 we need fresher Shiller `ie_data` (CSV-ified) at a fetchable URL. The build script will pick up new years automatically.

## Engine

- **Bengen 92.65% vs canonical 100%.** Real, not a bug. Bengen used 5y intermediate Treasuries (Ibbotson SBBI). We use Shiller's 10y constant maturity, which has more duration risk. To match Bengen exactly we'd need to add an intermediate-Treasury series. Trinity (75/25, 4%) hits 94.12% vs cited 95% — within 1pp because the equity weight dominates.
- **No worker pool yet.** `runScenario` runs on the main thread. A single scenario over ~150 start years is sub-10ms so this is fine for Phase 2, but Phase 4 sweeps across many scenarios will need `src/worker/` wired up via Comlink as the spec calls for.
- **Bootstrap tail seed mixing.** `runScenario` derives per-start-year RNG seeds via `seed ^ startYear`. Good enough for reproducibility but not statistically rigorous. If the bootstrap mode ever needs to publish percentile bands at high confidence, switch to a proper SplitMix or PCG seed-stream split.

## UI

- **Default chart only.** Phase 2 ships a read-only spaghetti chart against a static scenario. Draggable controllers (WithdrawalCurve, GlidePath) come in Phase 3.
- **No URL state.** Scenarios aren't shareable yet. Plan in CLAUDE.md §9 puts this in Phase 5.
