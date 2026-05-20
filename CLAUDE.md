# **CLAUDE.md — Historical Withdrawal Simulator**

## **1\. Vision**

A web app for stress-testing retirement withdrawal strategies against actual historical market sequences (1871–present). Goes beyond the 4% rule: users design custom allocation glide paths and withdrawal rules, then watch them run in parallel against every starting year in history. The interface is **chart-driven** — users shape strategies by dragging curves, not typing into spreadsheet cells.

Think: "What if Vanguard's retirement calculator and Tableau had a baby, and the baby was opinionated about UX."

## **2\. Core Concepts**

A **simulation** is one run of one strategy starting in one historical year, played forward year-by-year using the actual returns from that period.

A **scenario** is a strategy \+ portfolio definition. Running a scenario produces a **simulation set** — one simulation per valid historical start year (e.g. 1871–1965 for a 60-year retirement). The output is a fan of trajectories, not a single line.

A **comparison** is multiple scenarios run side by side, where the user has chosen which dimensions to hold constant and which to vary. The fundamental UI question is always: *which knobs are pinned, and which sweep?*

### **Key vocabulary**

- **Allocation strategy**: how the portfolio is split across stocks/bonds/cash over time  
- **Withdrawal strategy**: how much is pulled each year (fixed %, % of remaining, dynamic rule, etc.)  
- **Glide path**: an allocation strategy that changes over the retirement horizon  
- **Sequence-of-returns risk**: the core thing being measured — bad early years are catastrophic, good early years forgive almost anything  
- **Success**: portfolio survives the full horizon with positive real balance  
- **SWR (safe withdrawal rate)**: the highest fixed withdrawal % that succeeds in 95%+ of historical sequences for a given allocation

## **3\. Data Sources**

All data is **historical, US-focused, monthly or annual**. Bundle it as static JSON shipped with the app — no live data needed.

### **Primary source: Robert Shiller's online data**

- URL: `http://www.econ.yale.edu/~shiller/data.htm` (file: `ie_data.xls`)  
- Coverage: monthly, 1871–present  
- Fields: S\&P 500 price, S\&P 500 dividends, CPI, 10-year Treasury yield, real earnings  
- License: free for non-commercial use

### **Secondary: FRED (Federal Reserve Economic Data)**

- 3-month T-bill rate (`TB3MS`) for cash proxy, 1934–present  
- For 1871–1933 cash returns: use call money rates or commercial paper rates from NBER macrohistory database, or accept "no cash" simulations only start in 1934

### **Computed series (derive these in a build script):**

1. **Stock total return (real)**: monthly, includes reinvested dividends, deflated by CPI  
2. **Bond total return (real)**: 10-year Treasury constant-maturity total return \= coupon income \+ price change from yield movement, deflated by CPI. *Do not use yield as a proxy for return — it's wrong and the difference matters during rate cycles.*  
3. **Cash return (real)**: T-bill yield deflated by CPI  
4. **Annual versions** of each: compounded from monthly

### **Schema (`/data/historical.json`)**

{

  "meta": { "start": 1871, "end": 2025, "frequency": "annual" },

  "years": \[

    {

      "year": 1871,

      "stock\_return\_nominal": 0.1421,

      "stock\_return\_real": 0.1078,

      "bond\_return\_nominal": 0.0688,

      "bond\_return\_real": 0.0354,

      "cash\_return\_nominal": null,

      "cash\_return\_real": null,

      "cpi": 12.464,

      "inflation": 0.0

    },

    ...

  \]

}

Build script (`/scripts/build-data.ts`) downloads Shiller \+ FRED, computes derived series, emits JSON.

## **4\. Simulation Engine**

The engine is pure, deterministic, and runs in **Web Workers** so the UI stays responsive while sweeping hundreds of scenarios.

### **Core loop (real-dollar terms throughout — much cleaner than tracking nominal \+ inflation separately)**

function simulate(

  startYear: number,

  initialBalance: number,           // in today's $

  horizonYears: number,

  allocation: AllocationStrategy,

  withdrawal: WithdrawalStrategy,

  data: HistoricalSeries,

): SimulationResult {

  let balance \= initialBalance;

  const trajectory: YearState\[\] \= \[\];

  for (let t \= 0; t \< horizonYears; t++) {

    const calendarYear \= startYear \+ t;

    const state \= { t, balance, calendarYear, trajectory };

    // 1\. Determine this year's allocation weights

    const weights \= allocation.weights(state);  // {stock, bond, cash}

    // 2\. Determine this year's withdrawal (in today's $)

    const wd \= withdrawal.amount(state, initialBalance);

    // 3\. Withdraw at start of year

    balance \-= wd;

    if (balance \<= 0\) {

      trajectory.push({ t, balance: 0, withdrawal: wd, weights, depleted: true });

      return { trajectory, success: false, depletedAt: t };

    }

    // 4\. Apply real returns for this calendar year

    const r \= data\[calendarYear\];

    const portfolioReturn \=

      weights.stock \* r.stock\_return\_real \+

      weights.bond  \* r.bond\_return\_real \+

      weights.cash  \* r.cash\_return\_real;

    balance \*= (1 \+ portfolioReturn);

    trajectory.push({ t, balance, withdrawal: wd, weights, return: portfolioReturn });

  }

  return { trajectory, success: true, finalBalance: balance };

}

### **Running a scenario across history**

function runScenario(scenario: Scenario, data: HistoricalSeries): ScenarioResult {

  const allStartYears \= range(data.start, data.end \+ 1);          // every year, including in-progress

  const sims \= allStartYears.flatMap(y \=\> prepareSims(y, scenario, data));

  return {

    sims,

    successRate: completedSuccessRate(sims),                       // only counts complete sims

    percentiles: computePercentiles(sims, \[5, 25, 50, 75, 95\]),

    worstStartYear: sims.find(s \=\> \!s.success)?.startYear,

  };

}

`prepareSims` returns one or many sims per start year depending on the chosen `tailMethod` (see Partial-data handling below). The "complete" / "in-progress" distinction is preserved on each sim so the UI can render and aggregate them correctly.

### **Partial-data handling**

Long horizons mean we can't fully simulate recent retirees against complete historical data. A 50-year horizon with data ending in 2025 would historically allow start years only up to 1975 — so the 2008 financial crash retiree, who is arguably the most interesting recent case, gets excluded. We solve this with two modes selected per scenario via `tailMethod`:

**`'truncate'` (default):** for any start year where `startYear + horizon > data.end`, run the sim only as far as data permits and mark it `inProgress: true`. These sims contribute to the percentile envelopes at every `t` they cover, but are excluded from success-rate denominators (we don't know if they'll succeed yet). The "Where Am I" view (see §6) is the natural way to consume them.

**`'bootstrap'`:** for in-progress sims, fill the unknown tail by sampling contiguous N-year blocks from the full historical record. Generates `samplesPerPrefix` independent tail completions per start year, each producing its own simulation. The actual-data prefix is shared and identical across all M tails for a given start year — only the post-data portion varies. This way the realized 2008–2025 sequence is preserved for that retiree, and only the unknown 2025–2058 portion is sampled.

type TailMethod \=

  | { type: 'truncate' }

  | { type: 'bootstrap'; blockYears: number; samplesPerPrefix: number };

// defaults: blockYears \= 7, samplesPerPrefix \= 200

Algorithm (stationary block bootstrap, Politis–Romano 1994):

function bootstrapTail(

  prefixLength: number,

  totalLength: number,

  data: AnnualReturns\[\],

  blockYears: number,

  rng: () \=\> number,

): AnnualReturns\[\] {

  const tail: AnnualReturns\[\] \= \[\];

  while (tail.length \< totalLength \- prefixLength) {

    // Random starting point in the full historical record

    const blockStart \= Math.floor(rng() \* data.length);

    // Geometric block length with mean \= blockYears (gives stationarity)

    const blockLen \= Math.max(1, Math.ceil(-blockYears \* Math.log(rng())));

    for (let i \= 0; i \< blockLen && tail.length \< totalLength \- prefixLength; i++) {

      tail.push(data\[(blockStart \+ i) % data.length\]);

    }

  }

  return tail;

}

A geometric block length (rather than fixed) is what makes the resulting series stationary — a small but real detail that matters for clean statistics. RNG should be seedable so identical scenarios produce identical results; default seed \= hash of the scenario object so URL-shared scenarios are reproducible.

Bootstrap sims carry `bootstrapped: true` and `prefixYears: number` on the trajectory metadata; the renderer uses these to draw the actual-data prefix solid and the sampled tail with reduced opacity / hatching.

### **Sweeps**

A "sweep" varies one or two dimensions while pinning the rest:

function sweep(

  base: Scenario,

  axis: { dimension: string; values: number\[\] },

): ScenarioResult\[\] {

  return axis.values.map(v \=\> runScenario({ ...base, \[axis.dimension\]: v }, data));

}

For 2D sweeps (e.g. withdrawal rate × stock allocation) → produces a heatmap of success rates.

## **5\. Strategy DSL**

Strategies need to be both **(a) easy to construct via UI controls** and **(b) expressive enough for power users**. Solve this with a discriminated union of declarative strategy types, plus an `escape hatch` for arbitrary JS functions.

### **Withdrawal strategies**

type WithdrawalStrategy \=

  | { type: 'fixedPercent'; rate: number }                          // classic 4% rule (of initial, inflation-adjusted)

  | { type: 'fixedDollar'; amount: number }                          // fixed real $/year

  | { type: 'percentOfBalance'; rate: number }                       // % of current balance, self-adjusting

  | { type: 'piecewise'; pieces: { until: number; rate: number }\[\] } // 3% for 5y, then 4%

  | { type: 'guardrails'; base: number; floor: number; ceiling: number; trigger: number }

                                                                     // Guyton-Klinger style: bump up/down based on portfolio performance

  | { type: 'ruleBased'; rules: Rule\[\] }                             // visual rule builder

  | { type: 'custom'; fn: (state: YearState, initial: number) \=\> number }

### **Allocation strategies**

type AllocationStrategy \=

  | { type: 'static'; weights: Weights }

  | { type: 'glidepath'; start: Weights; end: Weights; transitionYears: number }

  | { type: 'linearDrift'; start: Weights; driftPerYear: Weights }

  | { type: 'ageInBonds'; currentAge: number }                       // classic "age in bonds"

  | { type: 'risingEquity'; start: Weights; end: Weights; years: number }  // Kitces "U-shape"

  | { type: 'ruleBased'; rules: Rule\[\] }

  | { type: 'custom'; fn: (state: YearState) \=\> Weights }

### **Rules (for `ruleBased` strategies)**

type Rule \= {

  if: Condition;

  then: Action;

};

type Condition \=

  | { type: 'returnAbove'; threshold: number; lookback: number }      // last year \>X%

  | { type: 'balanceVsInitial'; ratio: number; comparator: '\>' | '\<' }

  | { type: 'yearRange'; from: number; to: number }

  | { type: 'inflationAbove'; threshold: number };

type Action \=

  | { type: 'setWithdrawal'; rate: number }

  | { type: 'shiftAllocation'; delta: Weights };

This makes "in boom years go to 5%" expressible as a rule chain, while keeping common cases (fixed %, glide path) as one-liners.

### **The Scenario type**

The full scenario object passed to `runScenario`:

type Scenario \= {

  initialBalance: number;

  horizonYears: number;

  allocation: AllocationStrategy;

  withdrawal: WithdrawalStrategy;

  tailMethod: TailMethod;          // see §4 — defaults to { type: 'truncate' }

  seed?: number;                    // optional; otherwise derived from object hash

};

## **6\. UI Architecture — Charts as Controllers**

This is the differentiator. The principle: **the chart is the input AND the output**. No floating sliders, no number boxes when a draggable curve will do.

### **Three primary control surfaces**

**1\. The Withdrawal Curve** — x-axis: years into retirement (0–60). y-axis: withdrawal rate (% of initial). User drags handles on a polyline to shape the curve. Snap-to-grid on common values (3, 3.5, 4, 4.5, 5%). Right-click a segment to convert it to a rule ("during this segment, only withdraw if last year was positive").

**2\. The Glide Path** — x-axis: years. y-axis: cumulative allocation, stacked (stocks on bottom, bonds middle, cash top). User drags the boundaries between regions. Equivalent to a stacked area chart that's editable. Lock toggles per asset class let users pin one band while reshaping others.

**3\. The Portfolio Pie / Bar** — for static allocations, just a divided bar with draggable boundaries. Probably collapses into the Glide Path control by default — the static case is just a flat glide path.

### **The Sweep Selector**

A small panel (not a giant form) where the user picks **what varies**. Default UI: every parameter shows a small icon — a 📌 (pinned/constant) or a ↔ (sweeping). Clicking ↔ reveals an inline mini-chart for choosing the sweep range:

- Withdrawal rate ↔ \[3% — 6%, step 0.25%\]  
- Initial stock % ↔ \[50% — 100%, step 10%\]

Max two sweeping dimensions at once (UI gets unreadable beyond 2D).

### **The Results Surface**

Three views, toggled by tab:

**Spaghetti view**: every historical start year as a translucent line, x \= years into retirement, y \= portfolio balance (real $). Failures drawn in red and truncated where they hit zero. Hover any line → see start year, full trajectory highlighted, key stats. The 5th/25th/50th/75th/95th percentile envelope drawn over the spaghetti as a darker band. **Partial sims** (recent start years where data runs out before the horizon ends) are drawn solid for the actual-data prefix and either stop cleanly (truncate mode) or continue with reduced opacity / hatched stroke for the bootstrapped tail. A legend toggle lets users hide in-progress sims entirely if they want a clean "complete history only" view.

**Heatmap view** (when sweeping 2D): rows \= sweep-axis-1, cols \= sweep-axis-2, color \= success rate. Click a cell → drills into the spaghetti view for that scenario.

**Calendar heatmap**: rows \= start year, cols \= years into retirement, color \= portfolio balance as % of initial. Makes sequence-of-returns risk visually unmistakable — you can literally see 1929, 1966, 2000 as dark horizontal bands. Recent start-year rows are short (truncate mode) or extend with reduced saturation (bootstrap mode).

**Where Am I view** (for in-progress sims): for each recent retiree (start year ≥ `data.end - horizon`), plot their actual realized trajectory against the historical percentile band at the same year-into-retirement. Visually answers *"how is the 2008 retiree doing relative to historical peers at year 17?"* without speculation. This is the natural home for partial data — it turns the limitation into a feature. Caption format: *"Started 2008\. At year 17, currently tracking the 35th percentile of historical 17-year-in trajectories. Median peer at this point had $X."*

### **Comparison mode**

Toggle two scenarios A/B. Spaghetti view shows both fans in different colors with overlaid percentile envelopes. Side-by-side stat panel: success rate, median final balance, worst-case start year, max drawdown.

## **7\. Tech Stack**

- **Framework**: Vite \+ React \+ TypeScript. SPA, no SSR needed.  
- **Charts**: D3 for the editable controllers (handles, drag, snap behavior) and the `StartYearChart` multi-panel canvas. Highcharts (via `highcharts-react-official`) for read-only output charts (SpaghettiChart, SimDetailPanel, WhereAmI, CalendarHeatmap backdrop, optimize scatter, compare spaghetti).  
- **State**: Zustand. Strategy definitions, sweep config, results — three slices.  
- **Compute**: Web Workers via Comlink. The simulation engine module is pure TS, imported by both main thread (for tests) and worker (for production runs). Worker pool sized to `navigator.hardwareConcurrency`.  
- **Hosting**: Vercel. Static build, no server needed.  
- **Data**: shipped as a single \~50KB gzipped JSON in `/public/data/historical.json`.  
- **Testing**: Vitest for the sim engine (golden-master tests against published Trinity Study / Bengen results). Playwright for one or two end-to-end smoke tests.

### **Why no backend**

The whole simulation is \< 100MB of computed numbers worst case, and most sweeps finish in under a second on a modern laptop. Adding a backend buys nothing, costs latency, and complicates deploys.

## **8\. File Structure**

/

├── public/

│   └── data/

│       └── historical.json

├── scripts/

│   └── build-data.ts              \# downloads \+ transforms source data

├── src/

│   ├── engine/

│   │   ├── simulate.ts            \# core sim loop (pure)

│   │   ├── strategies.ts          \# strategy type defs \+ executors

│   │   ├── rules.ts               \# rule evaluation

│   │   ├── bootstrap.ts           \# stationary block bootstrap for partial-data tails

│   │   ├── sweep.ts               \# parallel sweep orchestration

│   │   └── stats.ts               \# percentiles, success rate, etc.

│   ├── worker/

│   │   ├── pool.ts                \# worker pool manager

│   │   └── sim.worker.ts          \# worker entry, imports engine/

│   ├── components/

│   │   ├── controls/

│   │   │   ├── WithdrawalCurve.tsx

│   │   │   ├── GlidePath.tsx

│   │   │   ├── SweepSelector.tsx

│   │   │   └── PortfolioInput.tsx

│   │   ├── results/

│   │   │   ├── SpaghettiChart.tsx

│   │   │   ├── Heatmap.tsx

│   │   │   ├── CalendarHeatmap.tsx

│   │   │   ├── WhereAmI.tsx       \# in-progress sims vs historical percentiles

│   │   │   └── StatPanel.tsx

│   │   └── compare/

│   │       └── ComparisonView.tsx

│   ├── store/

│   │   ├── scenarioStore.ts

│   │   ├── sweepStore.ts

│   │   └── resultsStore.ts

│   ├── data/

│   │   └── load.ts                \# fetches \+ caches historical.json

│   ├── App.tsx

│   └── main.tsx

└── tests/

    └── engine/

        ├── trinity.test.ts        \# reproduce Trinity Study results

        └── bengen.test.ts         \# reproduce Bengen 4% result

## **9\. Implementation Phases**

**Phase 1 — engine & data (no UI yet)**

- Build the data pipeline and ship `historical.json`  
- Implement `simulate`, all built-in strategy types, and `runScenario`  
- Validate against published results: Bengen's original 4% result for 1926+, Trinity Study success rates. If the engine doesn't reproduce these to within \~1pp, something is wrong — usually the bond return calculation.  
- CLI harness: `npm run sim -- --scenario=trinity-4pct` prints success rate

**Phase 2 — single-scenario UI**

- Static portfolio input, static withdrawal rate  
- Spaghetti chart of results  
- This is enough to be useful already and validates the loop

**Phase 3 — chart controllers**

- WithdrawalCurve component with draggable handles  
- GlidePath component (stacked editable bands)  
- Wire them to scenario store

**Phase 4 — sweeps**

- SweepSelector UI (pin vs sweep)  
- 1D sweep → array of spaghetti charts (small multiples)  
- 2D sweep → heatmap

**Phase 5 — comparison & polish**

- A/B mode  
- Calendar heatmap view  
- URL-based scenario sharing (encode strategy in querystring → strategies are linkable)  
- Export results as CSV

**Phase 6 — power-user features (optional)**

- Custom JS function strategies (sandboxed eval)  
- Rule builder UI for `ruleBased` strategies  
- Save/load scenarios to localStorage

## **10\. UX Principles**

1. **Every visible number should be draggable.** If something looks like a parameter, the user should be able to grab it.  
2. **Direct manipulation \> forms.** Always show the consequence of a change immediately — sweeps re-run on parameter change with debounce \~150ms.  
3. **The default scenario is good.** First load: 60% stocks / 40% bonds, 4% withdrawal, 30-year horizon, $1M starting. Shows immediately. No "click here to start."  
4. **Failures are not abstract.** When a strategy fails, show the actual year it would have failed in the spaghetti. "Started 1966, ran out of money in 1985." Concrete is more memorable than success-rate percentages.  
5. **Real dollars, not nominal.** All amounts are in today's purchasing power. Inflation is silent; users don't think about it. (Add a "show nominal" toggle for the curious.)  
6. **Distinguish observed from sampled.** Anything drawn from actual historical data renders solid; anything sampled (bootstrapped tails) renders translucent or hatched. Users should never have to guess which numbers are facts and which are projections.

## **11\. Scope Decisions**

These were considered and resolved during spec design — documenting them here so they don't get re-litigated:

1. **Bond returns**: full constant-maturity total return (coupon \+ price change from yield movement). Yield-as-proxy is wrong and matters during rate cycles. ✅ Confirmed.  
2. **Geographic coverage**: US-only for v1. The Shiller dataset is the longest clean series available; international (DMS dataset) is a 2x effort and a v2 question. ✅ Confirmed.  
3. **Tax handling**: out of scope. All numbers pre-tax. UI must say so. ✅ Confirmed.  
4. **Social Security / pensions**: out of scope. These are easy to add later as a `floors` array of fixed real $/year on the scenario. ✅ Confirmed.  
5. **Variable horizon (joint life expectancy)**: out of scope. Fixed N-year horizon is the standard simplification. ✅ Confirmed.  
6. **Real-dollar vs nominal-dollar engine**: real throughout. Cleaner math, matches user intuition. Nominal view is a UI toggle on the spaghetti, not an engine mode. ✅ Confirmed.  
7. **Partial-data handling for long horizons**: support both `truncate` (default) and `bootstrap` (opt-in) tail methods. Bootstrap uses stationary block bootstrap with default block length 7 years and 200 samples per prefix. Recent in-progress sims are surfaced via the dedicated "Where Am I" view, which sidesteps the question of projection entirely for users who want to stay in observed-data-only territory. ✅ Confirmed.

## **12\. Reference Targets (for testing)**

The engine should reproduce these well-known results:

- Bengen (1994): 4% withdrawal, 50/50 stocks/bonds, 30-year horizon, 1926+ start years → **100% historical success**  
- Trinity Study (1998): 4% withdrawal, 75/25, 30 years → **\~95% success rate**  
- 1966 retiree, 4% / 60-40 → **fails around year 25** (canonical bad-sequence case)

If any of these are off by more than 1–2 percentage points, the bond return or inflation handling is wrong.  

## **13\. Styling System**

The UI uses **Tailwind CSS v4** with a centralized design token layer. All hardcoded hex values, magic numbers, and ad-hoc CSS classes have been eliminated — one change in the token file propagates everywhere.

### Token definitions — `src/index.css`

All design tokens live in the `@theme` block:

- **Colors**: text scale (`--color-text` through `--color-text-disabled`), surface backgrounds (`--color-surface-*`), borders (`--color-border-*`), semantic status (`--color-error`, `--color-success`, `--color-stale`), asset classes (`--color-stock/bond/cash`), simulation outcomes (`--color-survived/depleted/in-progress/snapshot`)
- **Font sizes**: `--text-2xs` through `--text-xl` (10px–22px)
- **Shadows**: `--shadow-card`, `--shadow-popover`, `--shadow-sticky`

These tokens are available as Tailwind utility classes everywhere — `text-text-muted`, `bg-surface-panel`, `border-border-light`, `shadow-card`, etc.

### Chart colors — `src/components/colors.ts`

`ASSET` and `OUTCOME` objects expose colors as property getters that read from the CSS tokens via `getComputedStyle` at access time. **Do not hardcode hex values here** — change the token in `index.css` and chart colors update automatically.

### Shared UI primitives — `src/components/ui/`

- **`ToggleButton`** — pill-style active/inactive toggle; accepts `active`, `onClick`, optional `disabled`, `title`, `className`
- **`TabBar`** — segmented-control container; always wraps `ToggleButton`s
- **`fieldCls.ts`** — exported class-string constants (`FIELD_SM`, `FIELD_FULL`, `FIELD_AXIS`) for input/select elements; use these instead of repeating the focus-ring and border-transition classes inline

### Rules

1. Use token-based utilities (`text-text-muted`, `bg-surface-panel`) — never hardcode hex colors in className strings
2. Use the Tailwind spacing scale (`px-2.5`, `gap-3.5`) — arbitrary `[Npx]` values are only acceptable when no scale equivalent exists (e.g. `border-[1.5px]`, `py-[7px]`)
3. New toggle/mode-switch UIs → use `TabBar` + `ToggleButton`
4. New text inputs/selects → use a `fieldCls` constant as the base class string
