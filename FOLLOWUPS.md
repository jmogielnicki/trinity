# Follow-ups

Things deliberately deferred. Each one has a phase or trigger that should bring it back into scope.

## Data

- **Cash returns are `null` pre-1934.** From 1934 on we use FRED `TB3MS` (3-month T-bill, monthly factors compounded). For 1872–1933 we'd need NBER macrohistory call-money or commercial-paper rates — different beasts (overnight broker funding / corp credit) so they need their own series, not a drop-in proxy. Until added, simulations starting before 1934 with a cash sleeve drop it via `adjustWeightsForData` at year 0.

## Engine

- **Bengen ~94% vs canonical 100%.** Real, not a bug. Bengen used 5y intermediate Treasuries (Ibbotson SBBI). We use Shiller's 10y total-return series, which has more duration risk. To match Bengen exactly we'd need to add an intermediate-Treasury series. Trinity (75/25, 4%) hits ~94% vs cited 95% — within 1pp because the equity weight dominates.
- **Bootstrap tail seed mixing.** `runScenario` derives per-start-year RNG seeds via `seed ^ startYear`. Good enough for reproducibility but not statistically rigorous. If the bootstrap mode ever needs to publish percentile bands at high confidence, switch to a proper SplitMix or PCG seed-stream split.
- **No sweep over withdrawalSource.** Could add a 4th axis ("rebalance on/off" or "proportional vs waterfall vs bucket") but most useful comparisons are A/B and the snapshot pattern handles that.

## UI

- **`customSrc` runs unsandboxed JS.** Compiled via `new Function`, no CSP, no proxies. Acceptable for a personal tool; if this ever ships to untrusted users, revisit (worker with locked-down globals + parse-AST allowlist is the typical move). URL hydration prompts before evaluating now, but the in-app script editors still execute on apply without further checks.
- **Refill events aren't marked.** The sleeves view shows the cash band oscillating but doesn't explicitly mark the year a refill fired. Could add a small vertical tick at refill events; engine would need to surface that as trajectory metadata.
- **No sleeve view for the bootstrap tail.** A sleeve chart for a bootstrap sim conflates observed and sampled portions. Currently the sleeves view picks one sim; for bootstrap mode it'd be more honest to show a percentile band of the per-sleeve trajectory across the 200 samples.
