# AGENTS.md

Practical guide for picking up this codebase mid-stream. Skim this; read `CLAUDE.md` for the original product vision; read `FOLLOWUPS.md` for known-deferred items.

## 1. Quick start

```bash
npm install
npm run build-data        # regenerates public/data/historical.json from CSVs
npm test                  # 47 tests across 9 files, ~1s
npm run dev               # vite dev server
npm run build             # production build
npm run sim -- --scenario=bengen-4pct   # CLI smoke test
```

Type-check: `npx tsc -b`. Worker bundle emits separately as `sim.worker-*.js`.

## 2. Repo layout

```
public/data/
  ie_data.csv        # Shiller monthly (S&P, CPI, GS10, total-return indices)
  TB3MS.csv          # FRED 3-month T-bill (cash returns 1934+)
  historical.json    # built artifact consumed by the app
scripts/
  build-data.ts      # CSVs → historical.json
  sim.ts             # CLI sim harness (Bengen / Trinity scenarios)
src/
  engine/            # pure simulation logic, no React/DOM
  components/        # React UI; controls/ on left rail, results/ in main pane
  store/             # zustand slices
  worker/            # Comlink-wrapped engine in a Web Worker pool
  data/              # data loading, URL state, presets, CSV export
tests/engine/        # vitest, 9 files, 47 tests
```

## 3. Mental model

A **Scenario** is portfolio + withdrawal + source + tail policy. **Running** one produces a **ScenarioResult**: one **SimulationResult** per start year in the historical record. Each `SimulationResult` carries a year-by-year **trajectory** with **per-sleeve balances**.

Returns are real (inflation-adjusted) throughout. Nominal is reconstructed only when exporting.

### Strategy types (`src/engine/strategies.ts`)

`WithdrawalStrategy` — discriminated union:
- `fixedPercent` — rate × initial each year (the "4% rule")
- `fixedDollar` — constant real $/year
- `percentOfBalance` — rate × current balance
- `piecewise` — step buckets (legacy, kept for old saves)
- `piecewiseLinear` — what the curve editor emits; lerps between control points
- `guardrails` — Guyton-Klinger style adjust-on-trigger
- `ruleBased` — base rate + list of if/then rules; **last match wins**
- `custom` — function (can't round-trip)
- `customSrc` — string of JS body; compiled with `new Function`, **unsandboxed**

`AllocationStrategy` — same shape, plus `static`, `glidepath` (lerp start→end), `linearDrift`, `ageInBonds`, `risingEquity`. `ruleBased` here uses `shiftAllocation` actions; **all matches compound** (deltas sum).

### Withdrawal source (`src/engine/withdrawalSource.ts`)

How withdrawals come out of the portfolio. Separate from rate.

- `proportional` (default, `rebalance: true`) — withdraw proportionally; optionally rebalance back to target weights each year. With `rebalance: true` this reproduces the pre-sleeve engine exactly (verified by a year-by-year test).
- `waterfall` — drain sleeves in a configured order until withdrawal is met. No auto-rebalance.
- `bucket` — waterfall + a `RefillRule` that runs after returns: top up `targetSleeve` from `sourceSleeve` when target drops below `floor`, restoring to `ceiling`. Optionally gated by `sourceMinRatio` so the refill only fires when the source is at or above a multiple of its initial value.

### Tail handling (`src/engine/sweep.ts`)

For start years where the horizon would run past the data:
- `truncate` (default) — run as far as data permits, mark sim `inProgress: true`, exclude from success-rate denominators.
- `bootstrap` — fill the unknown tail by sampling contiguous N-year blocks via Politis-Romano stationary block bootstrap. `samplesPerPrefix` sims per in-progress start year, each sharing the actual-data prefix.

### Selection model (App state)

App holds `selectedYears: Set<number>`. The spaghetti chart and outcome strip both read from it. Click toggles; **shift + drag draws a marquee** on either the strip (1D) or spaghetti (2D); a clear button appears once anything is selected. Clicking a year opens the per-sim detail panel.

## 4. Stores (`src/store/`)

- `scenarioStore` — current editable scenario (balance, horizon, allocation, withdrawal, withdrawalSource, tailMethod)
- `sweepStore` — per-axis pin/sweep config, capped at 2 sweeping axes
- `resultsStore` — loaded data + worker pool + last `ScenarioResult` / `SweepGrid`. `recompute` is async, gated on pool readiness, with a monotonic id so older completions don't clobber a newer result.
- `compareStore` — optional snapshot for A/B overlay
- `libraryStore` — localStorage-backed named scenarios

State that needs to round-trip (URL hash, library, presets) goes through `SerializedState` in `src/data/urlState.ts`.

## 5. UI map (`src/components/`)

**Controls (left rail, top to bottom):**
`PresetPicker → PortfolioInput → AllocationEditor → WithdrawalEditor → WithdrawalSourceInput → TailMethodInput → SweepSelector → ScenarioLibrary`

(`ScenarioActions` — share / export / snapshot — lives in the header, not the left rail.)

`AllocationEditor` and `WithdrawalEditor` wrap their underlying chart editor with a `glide/rules/script` (alloc) or `curve/rules/script` (withdrawal) mode toggle. Mode switches between visual editor, rule builder, and `customSrc` script editor.

**Header:** title + `ScenarioActions` (share / export csv / snapshot) toolbar + `?` button toggling the About panel.

**Results (main pane):**
- View tabs: `spaghetti / calendar / where am i` (single-scenario)
- Sweep views: `SmallMultiples` (1D), `Heatmap` (2D)
- Single-scenario tabs use `StatPanel`, `SuccessBar`, `OutcomeStrip`, `Legend` as supporting components
- Clicking a spaghetti line opens `SimDetailPanel`, which has its own chart tabs: `balance & withdrawals` and `sleeve composition` (the `SleeveChart`)

## 6. Engine: data flow

```
ie_data.csv + TB3MS.csv
  → scripts/build-data.ts
  → public/data/historical.json
  → src/data/load.ts (fetch + cache)
  → HistoricalSeries (start, end, years[], byYear Map)
  → worker pool (Comlink): setData once per worker
  → runScenario per cell, results streamed back
```

`historical.json` schema:
```
{
  meta: { start, end, cash_start, cash_end, frequency: 'annual', sources, notes },
  years: [{ year, stock_return_nominal/real, bond_return_nominal/real,
            cash_return_nominal/real (null pre-1934), cpi, inflation }, ...]
}
```

Both `Total Return Price` (stocks) and `Total Bond Returns` cumulative columns from Shiller are **already in real terms**. Build script ratios successive Decembers for real returns, reconstructs nominal via inflation. Cash is annual TB3MS factors compounded.

## 7. Tests (47, all in `tests/engine/`)

| File | What |
|---|---|
| `bengen.test.ts` | 50/50 4% 30y 1926+ ≥ 93% (canonical 100% needs 5y intermediates) |
| `trinity.test.ts` | 75/25 4% 30y ~94% |
| `sequenceRisk.test.ts` | 1966 60/40 4% depletes between years 20-30 |
| `sweep.test.ts` | 1D withdrawal sweep monotonically falling, 2D builds full grid |
| `bootstrap.test.ts` | truncate→inProgress, bootstrap shared-prefix, reproducible w/ seed |
| `customSrc.test.ts` | inline JS withdrawal + allocation scripts compile |
| `withdrawalCurve.test.ts` | piecewiseLinear lerps between control points |
| `historicalData.test.ts` | 22 spot-checks pinning real Shiller / FRED values to ±1pp |
| `withdrawalSource.test.ts` | waterfall ordering, proportional preservation, bucket refill |

Add a test when adding a strategy type, source type, or non-trivial engine behavior.

## 8. Conventions

- **Always open a PR** — every piece of completed work ships as a pull request. After committing and pushing a branch, create a PR against `main` (via the `mcp__github__create_pull_request` tool) before reporting the task done. Never leave work on a pushed branch without a PR.
- **PRs** — small focused branches off `main`, squash-merged via the `mcp__github__merge_pull_request` tool. Each PR description has a Test plan checklist.
- **Branch names** — `claude/<topic>`.
- **Commits** — concise summary, then explanation of *why* not just *what*.
- **Comments** — explain non-obvious *why* / hidden invariants; avoid restating the code.
- **No animation, no toast libs** — small and direct beats fancy.
- **Visual checks** — I cannot run a browser in this environment. Always note "visual not run" in PR descriptions when UI changes ship.

## 9. Known limitations

See `FOLLOWUPS.md`. Highlights:
- Cash returns null pre-1934 (no NBER macrohistory imported)
- Bengen 94% vs canonical 100% (Shiller 10y bonds vs Ibbotson 5y intermediates)
- `customSrc` unsandboxed (URL hydration prompts before evaluating; in-app editors don't)
- Bootstrap seed mixing is reproducible-but-not-rigorous

## 10. Recent shape changes (since CLAUDE.md was written)

CLAUDE.md describes the original product vision; here's what's actually been built on top:

- **Sleeve-level engine** — `simulate.ts` tracks `{stock, bond, cash}` per year, not a single balance. `WithdrawalSource` controls how withdrawals come out (proportional/waterfall/bucket).
- **piecewiseLinear** withdrawal type — replaces the misleading step-function `piecewise` for the curve editor.
- **customSrc** strategy variant — string-of-JS, structured-clone-safe (works across workers and URL state).
- **Outcome strip** — barcode of start-year outcomes below the spaghetti, click/drag to select.
- **Sleeve composition** — stacked area of one sim's per-sleeve balances over time; a chart tab inside `SimDetailPanel` (not a top-level view).
- **Where Am I view** — completed-historical percentile band with the actual realized prefix of recent retirees.
- **Marquee selection** — shift+drag on either chart adds years to the selection.
- **Worker pool** — Comlink-wrapped engine, scenarios distributed round-robin.
- **Presets** — eight curated starting points incl. cash-bucket-with-refill.
- **URL share + localStorage library + CSV export** — full round-trip of `SerializedState`.

If you're picking up cold: load the **Cash bucket with refill — 50/35/15** preset, click a spaghetti line, and switch to the sleeve-composition chart tab to see the most novel piece working end-to-end.
