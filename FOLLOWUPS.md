# Follow-ups

Things deliberately deferred. Each one has a phase or trigger that should bring it back into scope.

## Data

- **Cash returns are `null` pre-1934.** From 1934 on we use FRED `TB3MS` (3-month T-bill, monthly factors compounded). For 1872–1933 we'd need NBER macrohistory call-money or commercial-paper rates — different beasts (overnight broker funding / corp credit) so they need their own series, not a drop-in proxy. Until added, simulations starting before 1934 with a cash sleeve silently drop the cash weight and renormalize stocks/bonds in `simulate.ts`.

## Engine

- **Bengen ~94% vs canonical 100%.** Real, not a bug. Bengen used 5y intermediate Treasuries (Ibbotson SBBI). We use Shiller's 10y total-return series, which has more duration risk. To match Bengen exactly we'd need to add an intermediate-Treasury series. Trinity (75/25, 4%) hits ~94% vs cited 95% — within 1pp because the equity weight dominates.
- **Bootstrap tail seed mixing.** `runScenario` derives per-start-year RNG seeds via `seed ^ startYear`. Good enough for reproducibility but not statistically rigorous. If the bootstrap mode ever needs to publish percentile bands at high confidence, switch to a proper SplitMix or PCG seed-stream split.

## UI

- **Allocation rule builder + script editor.** Phase 6 ships the rule builder + script editor only for `WithdrawalStrategy`. Allocation has the underlying `customSrc` + `ruleBased` types but no UI yet — needs an analogue of `WithdrawalEditor` for glide paths.
- **`customSrc` runs unsandboxed JS.** Compiled via `new Function`, no CSP, no proxies. Acceptable for a personal tool; if this ever ships to untrusted users, revisit (worker with locked-down globals + parse-AST allowlist is the typical move).
- **Hash-loaded `customSrc` is auto-applied.** A malicious URL could ship a payload. Add a confirm prompt before evaluating any `customSrc` strategy that came from the hash.
