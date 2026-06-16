# ROADMAP — outstanding work

Status as of the 2026-06 session. Two evaluation items shipped (external cash
flows → PR #133; spending-quality metrics + income floor → PR #134). This file
captures everything discussed but **not yet built**, with enough detail to hand
to a fresh session.

**Before starting any item:** read `AGENTS.md` (repo orientation, stores, mental
model), `CLAUDE.md` (product vision + §11 scope decisions), and `FOLLOWUPS.md`
(small deferred items). Verify with `npm test` (Vitest, 121 tests ~3s),
`npx tsc -b`, `npm run build`. The app is 100% client-side; the engine
(`src/engine/`) is pure TS with golden-master tests (`tests/engine/trinity.test.ts`,
`bengen.test.ts`) that must stay green — if a change moves them >1–2pp the bond
or inflation handling is wrong. To see changes live: `npx vite --port 5199 --strictPort`,
then drive with the Playwright MCP (URL state lives in the `#s=` base64 hash, so
scenarios are shareable/reproducible).

Effort key: **S** ≈ hours, **M** ≈ 1–3 days, **L** ≈ 1–2 weeks.

---

## Tier 1 — highest value

### 1. "What's my number" / SWR solver — **M**

**Rationale.** The FIRE community's first question is "what's my number / what's
my safe rate," and a traditional retiree's is "can I afford to retire." The app
today only answers "given these exact inputs, what's the success rate." It has
grid sweeps and a Pareto front but **no solver** that inverts the question.

**Impact.** Highest user-facing value per unit effort. Answers the two questions
every visitor opens the app with. Pure engine work + a small results surface;
no new data, no engine-correctness risk.

**Where.**
- Engine: new `src/engine/solve.ts`. Reuse `runScenario(scenario, data)` from
  `src/engine/sweep.ts` (returns `ScenarioResult` with `.successRate`).
- The two solves are bisections:
  - **Max safe rate**: bisect the `fixedPercent` rate (or any 1-param withdrawal)
    to find the highest rate with `successRate >= target` (default 0.95). Success
    rate is monotonic-decreasing in the rate, so bisection is valid.
  - **Your number**: bisect `initialBalance` to find the minimum balance hitting
    `successRate >= target` for the user's actual strategy. Also monotonic.
- UI: a small panel/button on the Build tab (near `StatPanel`,
  `src/components/results/StatPanel.tsx`) — "Find my safe rate" / "Find my
  number," showing the solved figure and a one-line caption.

**Implementation sketch.** ~20–30 `runScenario` calls per solve (bisection over
~150 cohorts each) → runs in well under a second; can stay on the main thread or
reuse the worker pool (`src/worker/pool.ts`, `useResultsStore`). Solve against
the *observed* `successRate` (truncate mode) for a hard historical answer; offer
the bootstrap `projectedSuccessRate` as a secondary readout.

**Gotchas.**
- Variable strategies (`percentOfBalance` etc.) can't deplete the same way —
  success rate isn't cleanly monotonic and "safe rate" is ill-defined. Scope the
  solver to `fixedPercent` (and `fixedDollar` for "your number"); show a "not
  applicable for variable strategies" note otherwise.
- Respect `incomes`/`cashflows`/`retireAge` from the scenario — they materially
  change the answer (that's the point). Thread them through like
  `candidateToScenario` in `src/engine/optimize.ts:109` does.
- Cohort set: keep the same start-year range the rest of the app uses so the
  solved number matches the displayed success rate exactly.

---

### 2. Simple vs Advanced mode + persona presets — **M**

**Rationale.** There are 7 withdrawal modes (`Fixed | Curve | Ratchet |
Floor + upside | CAPE | Rules | Script`) and 4 allocation modes. For a normal
retiree this is a wall; CAPE/endowment/ratchet are jargon. The depth is a
strength for power users but intimidating on first load.

**Impact.** Broadens the audience from FIRE/Bogleheads to ordinary retirees
(the stated goal). Low engine risk — it's disclosure, not new computation.

**Where.**
- `src/components/controls/WithdrawalEditor.tsx` — `Mode` type (line 10),
  `modeOf()` (18–31), `ModeToggle` (162–187). A Simple toggle would render a
  reduced `ModeToggle` (e.g. Fixed, Curve, Floor+upside with plain-English
  names: "Steady paycheck," "Flexible with a safety floor").
- `src/components/controls/AllocationEditor.tsx` — same pattern.
- Per-mode "when to use this" one-liners: `src/engine/strategyDescriptions.ts`
  already exists and is the natural home.
- Persona presets: `src/data/presets.ts` (`Preset` type: `{ id, name,
  description, state: SerializedState }`). Add "Traditional retiree (65, with
  Social Security)" and "Early retiree (FIRE)" that set balance/horizon/age +
  income + strategy. First-run could surface these.
- A Simple/Advanced flag would live in `src/store/scenarioStore.ts` (or a small
  UI store) and persist in the URL hash (`src/data/urlState.ts` `SerializedState`).

**Gotchas.**
- Don't lose state when toggling Simple→Advanced→Simple: keep the full strategy
  object, just hide controls. `modeOf()` already tolerates strategies the simple
  view can't show.
- Plain-English names must map cleanly back to the union types; keep the mapping
  in one place.

---

### 3. Input validation & soft warnings — **S**

**Rationale.** `NumericInput` (`src/components/controls/NumericInput.tsx:49`)
silently clamps to min/max and reverts invalid input on blur — there are **no
warnings**. A user can set 100% stocks over a 60-year horizon, an 8%+ withdrawal,
or a cash sleeve on pre-1934 cohorts and get a confident-but-misleading number.

**Impact.** Cheap trust/credibility win; prevents foot-guns. Inline notes, not
blockers.

**Where.**
- Soft warnings near the relevant control in `WithdrawalEditor.tsx` /
  `AllocationEditor.tsx` / `SituationEditor.tsx`. There's no existing warning UI
  pattern — establish a small reusable `<FieldNote variant="warn">` in
  `src/components/ui/`.
- Candidate rules: withdrawal rate > ~8%; 100% equity over long horizons; bucket
  refill settings that churn.
- **Pre-1934 cash visibility (important + currently misdocumented).** When a
  scenario has a cash sleeve and includes start years < 1934, surface a note.
  NOTE: `FOLLOWUPS.md` claims cash is "dropped via `adjustWeightsForData` at year
  0," but **that function does not exist**. The real behavior:
  `src/engine/withdrawalSource.ts:174` does `cash_return_real ?? 0`, so pre-1934
  the cash sleeve simply earns **0% real** (holds purchasing power, earns
  nothing) — it is *not* reweighted. Fix the FOLLOWUPS.md wording while you're
  here, and the UI note should say "cash earns 0% real before 1934 (no data)."

**Gotchas.** Keep warnings advisory; never block a run. The default scenario must
stay warning-free (UX principle #3: "the default scenario is good").

---

### 4. "Retirement smile" spending preset — **S**

**Rationale.** Real spending declines ~1–2%/yr through mid-retirement then rises
with healthcare (Blanchett's "retirement smile"). The Curve editor
(`piecewiseLinear`) can already express this — but nothing tells users, so nobody
builds it.

**Impact.** Makes a more realistic default reachable in one click. Zero engine
work.

**Where.** `src/data/presets.ts` — add a preset whose `withdrawal` is a
`piecewiseLinear` with points approximating the smile (high early, dip mid, rise
late). Optionally a one-line explainer in the Curve editor.

**Gotchas.** `piecewiseLinear` points are `{ t, rate }` with `t` in years;
`WithdrawalCurve` uses `N_HANDLES = 5` evenly spaced handles
(`src/components/controls/WithdrawalCurve.tsx:19`), so author the preset with 5
points at t = 0, ¼, ½, ¾, 1 of the horizon or it'll be re-interpolated on load.

---

## Tier 2 — strategy & realism depth

### 5. VPW and RMD-style withdrawal strategies — **M**

**Rationale.** VPW (Variable Percentage Withdrawal — age-rising % of balance) is
huge in the Bogleheads/FIRE world; an RMD-style rule mirrors what many retirees
are legally doing. Both are conspicuous absences from an otherwise deep list.

**Impact.** Directly serves the power-user audience; small, legible additions.

**Where.**
- Engine: add variants to the `WithdrawalStrategy` union in
  `src/engine/strategies.ts:4` and a `case` in `computeWithdrawal` (197–312).
  VPW = table/ formula of withdrawal % by age (needs `retireAge` + `state.t`);
  RMD = balance / life-expectancy-factor(age).
- UI: new mode in `WithdrawalEditor.tsx` (`Mode`, `modeOf`, `ModeToggle`,
  switchMode branch, render block) — or, if no custom editor, add to
  `WITHDRAWAL_EDITOR_UNSUPPORTED` (`src/engine/study.ts:271`) so it routes to a
  read-only/script presentation.
- Optimize: add an archetype to `WITHDRAWAL_ARCHETYPES` (`src/engine/study.ts:259`)
  if it should be sweepable.

**Gotchas.**
- VPW/RMD need **age**, but the engine works in years-into-retirement. `retireAge`
  exists in the scenario (presentation-only today) — thread it into the strategy
  executor, or require it and warn when unset.
- Both are variable strategies → they'll "succeed" while cutting spending. The
  spending-quality metrics from PR #134 (`spendingStats` in
  `src/engine/stats.ts`) already cover this; make sure new strategies surface in
  those cards.
- Add a golden test against a published VPW table if you can find one.

### 6. "Show nominal" toggle on the spaghetti chart — **M**

**Rationale.** Spec principle #5 and §11.6 call for a nominal display toggle; the
engine is real-only by design (correct), but some users want to see the
nominal-dollar climb. `AboutPanel.tsx:21` already explains the real-dollar choice.

**Impact.** Satisfies a recurring "why do my dollars look flat" question without
touching the engine.

**Where.**
- `src/components/results/SpaghettiChart.tsx` plots `r.balance` (real). A toggle
  would multiply each year's real balance by the cumulative inflation factor from
  the cohort's start year to that year.
- The data is there: `AnnualReturns` (`src/engine/types.ts:7`) carries `cpi` and
  `inflation` per year; `historical.json` has both. Compute a cumulative CPI
  ratio `cpi[t] / cpi[startYear]` and scale.

**Gotchas.**
- This is **display-only** — do not add a nominal mode to the engine (§11.6).
  Convert at render time in the chart.
- Bootstrap tails have no real calendar CPI for the sampled portion — either
  disable nominal for bootstrapped sims or approximate with the sampled blocks'
  inflation. Document whichever you pick.
- Percentile envelope and `StatPanel` figures would also need converting if you
  want consistency; scope carefully (maybe spaghetti-only v1).

---

## Tier 3 — Pro-tier depth

### 7. Simple tax knob — **S–M**

**Rationale.** Full tax modeling is rightly out of scope (§11.3, all numbers
pre-tax). But an "effective tax rate on withdrawals" gross-up covers ~80% of the
realism gap with one parameter.

**Impact.** Meaningful realism for a one-field cost; good Pro candidate. Must be
clearly labeled an approximation.

**Where.** Add an optional `effectiveTaxRate` to `Scenario` (`src/engine/sweep.ts:17`)
and `SimulateInput` (`src/engine/simulate.ts`). In the sim loop, gross up the
portfolio-funded portion of the draw by `1/(1-rate)` (income is typically taxed
differently — decide whether the knob applies to the whole withdrawal or just the
portfolio draw; simplest defensible v1: portfolio draw only). Thread through
stores/URL/optimize exactly like `incomes`/`cashflows` did in PR #133 (that diff
is the template — search for `incomes` across `sweep.ts`, `simulate.ts`,
`sweepRunner.ts`, `optimize.ts`, `scenarioStore.ts`, `urlState.ts`,
`compareScenariosStore.ts`).

**Gotchas.** Label as approximate everywhere. Don't double-tax income that's
already net (SS is partly taxable — out of scope; note it).

### 8. Mortality-weighted success (variable horizon) — **M–L**

**Rationale.** Fixed horizons overstate late-year risk — you might not live to
year 40. §11.5 deliberately kept fixed N-year horizons, so this is **opt-in,
shown alongside** (never replacing) the fixed-horizon number.

**Impact.** "Probability of dying with money" is a more honest headline for some
users. Larger lift; treat as Pro.

**Where.**
- Static SSA period life table as JSON (bake into `public/data/`). Needs
  `retireAge` (`src/store/scenarioStore.ts`).
- The weighting infra partly exists: `SimulationResult.weight` and
  `weightedQuantile`/`successStats` in `src/engine/stats.ts` already handle
  per-sim weights (used for bootstrap). A mortality-weighted success would weight
  each *horizon year's* survival probability rather than per-sim — so it's a new
  aggregation, not just a weight field. Compute "survives to depletion vs dies
  first" integrated over the survival curve.

**Gotchas.** Keep it a separate displayed metric; the fixed-horizon success rate
is the golden-master-tested number and must not change. Joint life expectancy
(couples) is a further extension — single-life first.

### 9. Intermediate-Treasury series + data improvements — **M–L**

**Rationale.** Two things at once: (a) closes the known **Bengen calibration gap**
and (b) widens asset choices.

`FOLLOWUPS.md`: *"Bengen ~94% vs canonical 100%. Real, not a bug. Bengen used 5y
intermediate Treasuries (Ibbotson SBBI). We use Shiller's 10y total-return series,
which has more duration risk. To match Bengen exactly we'd need to add an
intermediate-Treasury series."*

**Impact.** Makes the headline benchmark reproduce the canonical 100%, which
builds trust; intermediate Treasuries are also just a more standard bond proxy.
Further series (TIPS from ~1997, international/DMS, small-cap, gold) each widen
the `Weights` type and every allocation editor — significant; pick 1–2.

**Where.**
- Data pipeline: `scripts/build-data.ts` computes annual real returns by ratioing
  December cumulative total-return indices. Add a 5y intermediate-Treasury total
  return (FRED has constituent series) and emit it into `historical.json`.
- `AnnualReturns` (`src/engine/types.ts:7`) and the engine's per-sleeve returns
  (`applyReturns` in `src/engine/withdrawalSource.ts:170`) currently assume a
  fixed 3-sleeve `Weights = { stock, bond, cash }`. Adding a *selectable* bond
  series is easier than adding a 4th sleeve: let bond return point at either the
  10y or the 5y series via a scenario flag. Adding new asset *classes* (gold,
  intl) means widening `Weights` everywhere — much bigger.
- Pre-1934 cash: NBER call-money / commercial-paper to unlock early cohorts with
  cash sleeves (see item #3 for the current 0%-real behavior).

**Gotchas.** Adding a sleeve touches `Weights`, `Sleeves`, both allocation
editors (`StackedBar`, `FixedAllocationBar`, `GlidePath`), `colors.ts`/tokens,
and every percentile/stat that iterates sleeves — audit thoroughly. A selectable
bond series is the lower-risk way to get the Bengen win.

---

## Deferred polish / tech-debt (not features)

- **Surplus-income years render as negative "withdrawal" bars** in
  `SimDetailPanel.tsx`. When income > spending the net portfolio draw is negative
  (a deposit), and the per-year bars show it as a negative withdrawal. Truthful
  but unpolished — give deposits their own visual treatment. Touches the same
  detail-panel code the income work added.
- **`circumstances` object refactor.** `incomes`, `cashflows`, `retireAge` (and a
  future `effectiveTaxRate`, mortality opts) are threaded as parallel optional
  fields through ~6 construction sites (`Scenario`, `SimulateInput`,
  `OptimizeConfig`, `CompareOverride`, `SerializedState`, stores). If more
  circumstance fields land, fold them into one `Circumstances` object to stop the
  repetition. Not worth it yet.
- **`FOLLOWUPS.md` cash-drop wording is wrong** (see item #3) — fix it.

## Explicitly dropped

- **Fees / expense-ratio knob.** Considered and rejected this session: the user's
  position is that fund/advisor fees should be folded into the user's spending
  number, not a separate engine input. Don't re-add without revisiting that call.

---

## Suggested next pick

**#1 (SWR / "what's my number" solver)** — highest value per effort, pure engine
+ small UI, no data or correctness risk, and it answers the question most users
arrive with. #3 (validation) and #4 (smile preset) are cheap wins that could ride
along in the same PR or a quick follow-up.
