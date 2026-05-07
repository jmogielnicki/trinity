# Follow-ups

Things deliberately deferred. Each one has a phase or trigger that should bring it back into scope.

## Data

- **Cash returns are `null`** for every year. Need FRED `TB3MS` (3-month T-bill, 1934+) to populate `cash_return_*`. Until then, any allocation with a cash sleeve has the cash weight silently dropped and the remaining weights renormalized in `simulate.ts`. Revisit when egress to FRED is available or someone drops a TB3MS CSV into the repo.

## Engine

- **Bengen ~94% vs canonical 100%.** Real, not a bug. Bengen used 5y intermediate Treasuries (Ibbotson SBBI). We use Shiller's 10y total-return series, which has more duration risk. To match Bengen exactly we'd need to add an intermediate-Treasury series. Trinity (75/25, 4%) hits ~94% vs cited 95% — within 1pp because the equity weight dominates.
- **No worker pool yet.** `runScenario` runs on the main thread. Phase 4's 2D sweeps (e.g. 13 × 7 = 91 scenarios) take ~500ms on a modern laptop — noticeable lag but not blocking. The Comlink-based pool from CLAUDE.md §7 should land before sweeps get bigger or the bootstrap tail mode goes interactive (200 samples × 100 start years × 10 scenarios = much heavier).
- **Bootstrap tail seed mixing.** `runScenario` derives per-start-year RNG seeds via `seed ^ startYear`. Good enough for reproducibility but not statistically rigorous. If the bootstrap mode ever needs to publish percentile bands at high confidence, switch to a proper SplitMix or PCG seed-stream split.

## UI

- **Allocation rule builder + script editor.** Phase 6 ships the rule builder + script editor only for `WithdrawalStrategy`. Allocation has the underlying `customSrc` + `ruleBased` types but no UI yet — needs an analogue of `WithdrawalEditor` for glide paths.
- **`customSrc` runs unsandboxed JS.** Compiled via `new Function`, no CSP, no proxies. Acceptable for a personal tool; if this ever ships to untrusted users, revisit (worker with locked-down globals + parse-AST allowlist is the typical move).
- **Hash-loaded `customSrc` is auto-applied.** A malicious URL could ship a payload. Add a confirm prompt before evaluating any `customSrc` strategy that came from the hash.
