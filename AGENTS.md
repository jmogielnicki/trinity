# AGENTS.md

Practical guide for picking up this codebase mid-stream. Skim this; read `CLAUDE.md` for the original product vision; read `FOLLOWUPS.md` for known-deferred items.

## 1. Quick start

```bash
npm install
npm run build-data        # regenerates public/data/historical.json from CSVs
npm test                  # 100 tests across 16 files, ~1s
npm run dev               # vite dev server
npm run build             # tsc -b + api typecheck + vite build
npm run screenshot        # capture the running app to /tmp/shot-*.png (see §11)
npm run sim -- --scenario=bengen-4pct   # CLI smoke test
npm run db:migrate        # apply scripts/migrations/*.sql (needs DATABASE_URL)
```

Type-check: `npx tsc -b` (app/engine) and `npx tsc -p api/tsconfig.json` (serverless functions — `npm run build` runs both). Worker bundle emits separately as `sim.worker-*.js`.

Auth/payments are **optional locally**: without the `VITE_NEON_*` env vars (`.env.example`) the app runs in pure anonymous mode (local saves only). See `AUTH_PLAN.md` for the full setup.

## 2. Repo layout

```
public/data/
  ie_data.csv        # Shiller monthly (S&P, CPI, GS10, total-return indices)
  TB3MS.csv          # FRED 3-month T-bill (cash returns 1934+)
  historical.json    # built artifact consumed by the app
scripts/
  build-data.ts      # CSVs → historical.json
  sim.ts             # CLI sim harness (Bengen / Trinity scenarios)
  migrate.ts         # raw-SQL migration runner (npm run db:migrate)
  migrations/        # 0001_auth.sql … (saved_scenarios + user_profiles + RLS)
api/                 # Vercel serverless functions — the ONLY backend (Stripe only)
  _lib/              # auth (JWKS verify), db (Neon), stripe — shared helpers
  create-checkout.ts # one-time Pro Checkout Session
  stripe-webhook.ts  # grants Pro on checkout.session.completed
  tsconfig.json      # NodeNext — relative imports need .js (ESM at runtime!)
vercel.json          # SPA rewrite that preserves /api/*
src/
  auth.ts            # Neon Auth + Data API client (createClient) + getAccessToken
  billing.ts         # startCheckout → POST /api/create-checkout
  engine/            # pure simulation logic, no React/DOM
    simulate.ts      # core sim loop (sleeve-level)
    strategies.ts    # WithdrawalStrategy + AllocationStrategy unions + executors
    withdrawalSource.ts  # proportional / waterfall / bucket
    rules.ts         # rule evaluation
    bootstrap.ts     # stationary block bootstrap
    sweep.ts         # runScenario + TailMethod
    sweepRunner.ts   # sweep orchestration (1D/2D grids)
    optimize.ts      # Pareto-front candidate search; CandidateMetrics
    study.ts         # StudyConfig + StudyDimension; generateStudy
    evolve.ts        # genetic algorithm (7-gene genome, island model)
    stats.ts         # percentiles, success rate
    types.ts         # shared types (Weights, Sleeves, ScenarioResult, …)
  components/        # React UI
    auth/            # AuthControl (header sign-in/account), AuthModal, ProGate
    controls/        # left-rail strategy editors
    results/         # spaghetti, calendar, WhereAmI, StartYearChart, SimDetailPanel
    optimize/        # FrontierView, StudyConfigPanel, StudyHeatmaps, StudyTrajectories
    evolve/          # EvolveView (genetic algorithm UI)
    compare/         # CompareScenariosView (multi-scenario comparison tab)
    ui/              # TabBar, ToggleButton, fieldCls
    AboutPanel.tsx
    SaveScenarioModal.tsx
    colors.ts
  store/             # zustand slices
  worker/            # Comlink-wrapped engine in a Web Worker pool
  data/              # data loading, URL state, presets, CSV export, scenarioRepo (local+cloud)
tests/engine/        # vitest, 16 files, 99 tests
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
- `compareStore` — optional snapshot for inline A/B overlay on the spaghetti chart (single-scenario tab only)
- `compareScenariosStore` — drives the **Compare** tab; holds a set of saved scenarios and their computed results + metrics for side-by-side display
- `optimizeStore` — study configuration + Pareto-front results for the **Optimize** tab
- `evolveStore` — genetic algorithm state (running flag, generation history, island snapshots) for the **Evolve** tab
- `authStore` — Neon Auth session: `status` (`loading`/`anon`/`authed`), `user`, `subscriptionStatus` (`'free'`/`'pro'`), sign-in/up/out, and a shared `authModalOpen` flag. Inert when auth isn't configured.
- `libraryStore` — named scenarios, **source-aware + async**: anonymous → `localStorage`, signed-in → Neon Data API (`scenarioRepo`). Reloads on auth change; offers a one-time local→cloud migration.

State that needs to round-trip (URL hash, library, presets) goes through `SerializedState` in `src/data/urlState.ts` — the same blob stored in `saved_scenarios.state`.

## 5. UI map (`src/components/`)

**Top-level modes** (`TopMode` in `App.tsx`): `single | optimize | evolve | compare | about`. Tabs sit full-width between the context bar and the results pane. The left-rail strategy panel is rendered only on `single`; all other modes go full-width.

**Layout:**
- *Context bar* (full-width, below the header, applies to every tab): `PortfolioInput` — initial balance + horizon.
- *Strategy panel* (left rail, **single tab only**): `PresetPicker → AllocationEditor → WithdrawalEditor → WithdrawalSourceInput → TailMethodInput`, then `ScenarioLibrary`.

(`ScenarioActions` — share / export / snapshot — lives in the header, not the left rail.)

`AllocationEditor` and `WithdrawalEditor` wrap their underlying chart editor with a `glide/rules/script` (alloc) or `curve/rules/script` (withdrawal) mode toggle. Mode switches between visual editor, rule builder, and `customSrc` script editor.

**Header:** title + `ScenarioActions` (share / export csv / snapshot) toolbar + `AuthControl` (Sign in / account menu, only when auth is configured) + `?` button toggling `AboutPanel`.

**Pro gating:** when auth is configured and `subscriptionStatus !== 'pro'`, the **Optimize** and **Evolve** tabs render `ProGate` (an "Upgrade to Pro" paywall) instead of the tool. This gate is **cosmetic** — the compute is client-side; see `AUTH_PLAN.md` §2. The only hard-enforced things are cloud save (RLS) and the Pro flag itself (set only by the Stripe webhook).

**Single-scenario results (main pane):**
- View toggle: `spaghetti / calendar`. `WhereAmI` is a drill-down reached from an in-progress-cohorts banner on the spaghetti view (with a back link), not a peer toggle.
- Sweep views: `SmallMultiples` (1D), `Heatmap` (2D)
- `StatPanel` takes `showSuccess` — false on spaghetti, true on calendar; not rendered on WhereAmI
- `StartYearChart` — three-panel D3 canvas chart (avg spend / terminal balance / outcome barcode), replaces the former separate `SuccessBar` + `OutcomeStrip` components (those files still exist but are unused)
- `Legend` — asset-class color key
- Clicking a spaghetti line opens `SimDetailPanel`: stacked sleeve-composition area on top, source-colored withdrawal bars below

**Optimize tab** (`FrontierView`): runs a configurable study (1D or 2D sweep over allocation + withdrawal variants) and plots a Pareto frontier of success rate vs. median final balance. `StudyConfigPanel` configures axes; `StudyHeatmaps` and `StudyTrajectories` display results. Selecting a point applies it to the single-scenario tab.

**Evolve tab** (`EvolveView`): genetic algorithm over a 7-gene genome (glide-path allocation + 4-point piecewise-linear withdrawal). Runs across multiple island populations; `evolveStore` tracks generation history. Results can be applied to the single-scenario tab.

**Compare tab** (`CompareScenariosView`): picks multiple saved scenarios from the library, runs each against history, and displays a combined Highcharts spaghetti + metrics table side-by-side. Distinct from the inline snapshot overlay (`compareStore`) that overlays one saved result on the single-scenario spaghetti.

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

## 7. Tests (100, all in `tests/engine/`)

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
| `optimize.test.ts` | candidate metrics, Pareto-front ordering, study grid shapes |
| `percentiles.test.ts` | bootstrap vs truncate observed-rate consistency; weighted percentiles |
| `cashDataBoundary.test.ts` | pre-1934 cash-null handling, weight adjustment |
| `endowment.test.ts` | endowment-style fixed-spend + percentOfBalance strategies |
| `floorAndUpside.test.ts` | floor + upside-sharing withdrawal rules |
| `ratchet.test.ts` | ratchet withdrawal (never cut, only raise) |
| `vanguardDynamic.test.ts` | Vanguard dynamic spending rule |

Add a test when adding a strategy type, source type, or non-trivial engine behavior.

## 8. Conventions

- **Always open a PR** — every piece of completed work ships as a pull request. After committing and pushing a branch, create a PR against `main` (via the `mcp__github__create_pull_request` tool) before reporting the task done. Never leave work on a pushed branch without a PR.
- **PRs** — small focused branches off `main`, squash-merged via the `mcp__github__merge_pull_request` tool. Each PR description has a Test plan checklist.
- **Branch names** — `claude/<topic>`.
- **Commits** — concise summary, then explanation of *why* not just *what*.
- **Comments** — explain non-obvious *why* / hidden invariants; avoid restating the code.
- **No animation, no toast libs** — small and direct beats fancy.
- **Visual checks** — the web execution container ships with Playwright + headless Chromium pre-installed globally, so UI changes **can and should** be exercised in a real browser before reporting them done. See §11 below for the exact pattern. Type checks and tests verify correctness, not feature behavior.
- **API functions are ESM** — `api/*` runs under Node's ESM loader (`"type": "module"`), so **relative imports need an explicit `.js` extension** (e.g. `./_lib/auth.js`). `api/tsconfig.json` is NodeNext so a missing one is a typecheck error.
- **Secrets are server-only** — never prefix a secret with `VITE_` (that ships it in the client bundle). `STRIPE_*`, `DATABASE_URL`, `NEON_AUTH_JWKS_URL` live only in Vercel function env; only Neon's public URLs are `VITE_`.
- **`user_profiles` is read-only to clients** — `subscription_status` is written solely by the Stripe webhook over a direct DB connection. Don't add a client write path.

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
- **StartYearChart** — three-panel D3 canvas chart (avg spend / terminal balance / outcome barcode) with click + shift-drag marquee selection. Replaced the former separate `SuccessBar` and `OutcomeStrip` components (those still exist as files but are no longer imported).
- **Sleeve composition** — stacked area of one sim's per-sleeve balances over time; the upper section of the `SimDetailPanel` chart (not a top-level view), with source-colored withdrawal bars below it.
- **Where Am I view** — completed-historical percentile band with the actual realized prefix of recent retirees.
- **Marquee selection** — shift+drag on either StartYearChart or SpaghettiChart adds years to the selection.
- **Worker pool** — Comlink-wrapped engine, scenarios distributed round-robin.
- **Presets** — eight curated starting points incl. cash-bucket-with-refill.
- **URL share + localStorage library + CSV export** — full round-trip of `SerializedState`.
- **Optimize tab** (`FrontierView`) — configurable study sweeps allocation + withdrawal axes and plots a Pareto frontier. Built on `engine/optimize.ts` + `engine/study.ts`; state in `optimizeStore`.
- **Evolve tab** (`EvolveView`) — genetic algorithm discovers withdrawal/allocation strategies. 7-gene genome over a 4-island population. Built on `engine/evolve.ts`; state in `evolveStore`.
- **Compare tab** (`CompareScenariosView`) — multi-scenario comparison picked from the library; runs each against history and shows a unified Highcharts spaghetti + metrics table. Separate from the inline A/B snapshot overlay (`compareStore`) which overlays one saved result on the single-scenario chart.
- **Chart library** — read-only output charts (SpaghettiChart, SimDetailPanel, WhereAmI, CalendarHeatmap backdrop, optimize scatter, compare spaghetti) use **Highcharts**, not Recharts/visx as originally planned. D3 is still used for the editable controllers (WithdrawalCurve, GlidePath) and SVG-based D3 canvas in StartYearChart.
- **Freemium auth + payments** — a three-tier model (anonymous → free → pro) added on top, contradicting CLAUDE.md §7's "no backend": there's now a **minimal Stripe-only** backend in `api/`. Identity is **Neon Auth** (Better Auth), cloud-saved scenarios go through the **Neon Data API + RLS** (no scenario endpoints — RLS is the boundary), and **Stripe** one-time payment unlocks the advanced tabs. Full design + live-setup runbook in **`AUTH_PLAN.md`** (the source of truth for this layer).

If you're picking up cold: load the **Cash bucket with refill — 50/35/15** preset, click a spaghetti line, and switch to the sleeve-composition chart tab to see the most novel piece working end-to-end.

## 11. Browser-based verification / screenshots (Claude Code on the web)

**Use the committed tool — don't reinvent this, and do NOT run `npx playwright
install`.** That hits the Playwright browser CDN, which is **blocked** in this
sandbox (`403 Host not in allowlist`) and wastes a lot of time. A Chromium build
is already **pre-baked into the image**; `scripts/screenshot.mjs` finds and uses
it for you (see `scripts/README.md` for the full why/how).

The loop: start the dev server, run the tool, then `Read` the PNG — the Read
tool surfaces images inline, so the model can actually see what rendered.

```bash
npm run dev > /tmp/vite.log 2>&1 &
until curl -fs localhost:5173 > /dev/null; do sleep 1; done   # wait for ready

node scripts/screenshot.mjs                                   # localhost:5173 → /tmp/shot-{desktop,mobile}.png
node scripts/screenshot.mjs http://localhost:5173/optiona /tmp/opta --viewports=desktop
node scripts/screenshot.mjs http://localhost:5173/ /tmp/opt --selector="text=Optimize strategies" --wait=6000
```

Then `Read /tmp/shot-desktop.png` to view the result.

**Why a bare `import 'playwright'` fails (the trap that bit earlier sessions):**
the repo's *local* devDependency `playwright` is often a newer version than the
pre-baked browser revision (e.g. local 1.60 wants browser rev 1223, image ships
rev 1194), so `chromium.launch()` throws "Executable doesn't exist…". The tool
sidesteps this by preferring the **system** Playwright at
`/opt/node22/lib/node_modules` (which matches the on-disk browser) and, failing
that, launching with an explicit `executablePath` to whatever `chrome` binary is
actually present. Reuse that logic via `import { launchBrowser } from
'./scripts/screenshot.mjs'` instead of copy-pasting absolute paths.

Gotchas:
- **Health-check the dev server before each run** (`curl -fs localhost:5173`) —
  the background server occasionally dies between runs; relaunch if down.
- **Drive the page before screenshotting.** A static snapshot of the landing
  route rarely catches the bugs that matter; use `--selector` to click into the
  flow, and bump `--wait` (this app has a scroll-linked header animation, so tab
  switches need ~6s to settle).
- **Use `Read` (multimodal) to view PNGs**, not `Bash cat`/`file`.
- **`SendUserFile` with `status: 'normal'`** surfaces a screenshot to the user
  when reporting that a change works.
