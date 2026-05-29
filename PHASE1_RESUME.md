# Resume note — styling restyle (scratch; delete when Phase 1 lands)

**For the next session. Not part of the styling system — a working memo.**

## Where we are
- Approved direction: **Evergreen** (Option A). Prototypes at `/optiona`
  `/optionb` `/optionc` (`src/proto/`). Plan: `STYLING_PLAN.md`.
- **Merged to `main`:** PR #122 (prototypes + plan) = commit `dc3e15d`.
- Branch `claude/stoic-bell-xKxXK`, `main`, and local HEAD are **all at
  `dc3e15d`**, working tree clean. Start Phase 1 directly on the branch.

## ⚠️ Incident to remember
- I accidentally squash-merged **PR #120** (your "optimize holdings cash +
  glide" work) instead of #122, under the wrong title
  (`…(#120)` commit `c74ff2c`). Per your call we **left it merged** — #120's
  code is legitimately on main; only the squash-commit title is mislabeled.
  Do **not** try to "fix" it by reverting/rewriting unless asked.
- Lesson: when merging, pass the exact PR number just created — don't hardcode.

## Next: Phase 1 — token layer (theme-agnostic plumbing, Evergreen values)
Edit **`src/index.css`** `@theme` only; aim for **zero component edits** this
phase (existing utility classes shift to Evergreen automatically).

1. **Re-point existing tokens** to Evergreen so current classes restyle for free:
   - `--color-primary` → `#14513A` (forest), `--color-primary-hover` → `#1E6B4D`,
     `--color-primary-ring` → `rgba(20,81,58,0.28)`.
   - `--color-secondary` → keep as the accent role but set to gold `#C2872B`
     (it's used as the "Save"/CTA color + NavTab active; confirm gold reads well
     there, else introduce a distinct `--color-accent` and only move CTAs later).
   - Surfaces: `--color-surface-page` `#F4F1E9`, keep `--color-surface` `#fff`,
     add `--color-surface-2` `#F1EDE3`, `--color-surface-3` `#E8E2D4`;
     re-point `surface-muted/panel` to the warm tints.
   - Text: `--color-text` `#1B2A23`, `--color-text-secondary` `#586A60`,
     `--color-text-muted`/`faint` toward `#8B968C`. Borders `#E4DECF` /
     strong `#D4CBB6`.
2. **Add new role tokens** (don't break `colors.ts`): `--color-accent`,
   `--color-accent-soft`, `--color-brand-soft`, `--color-positive` `#1F7A52`,
   `--color-negative` `#BE4A30`, `--color-border-strong`.
3. **Add axes that are currently ad-hoc:** `--font-sans` / `--font-serif`
   (Iowan/Palatino/Georgia) / `--font-mono`; radius scale
   (`--radius-sm/md/lg/pill`); confirm/extend `--text-2xl` `--text-3xl`;
   warm-tinted shadows.
4. Set `<html data-theme="evergreen">` (index.html) and base body
   `font-family: var(--font-sans)`.
5. **Leave chart tokens unchanged** this phase (`--color-stock/bond/cash`,
   `survived/depleted/...`) — `colors.ts` reads them; aligning chart palette to
   Evergreen is a Phase 4/5 decision.

## Verify Phase 1
- `npm run build` green.
- Screenshot via **pre-baked** Chromium (do NOT `npx playwright install`):
  ```js
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  const { createRequire } = require('module');
  const req = createRequire('/opt/node22/lib/node_modules/');
  const { chromium } = req('playwright');
  await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  ```
  Dev server: `npm run dev` (port 5173). Capture `/` desktop+mobile and compare
  to the white/gray baseline — palette should read forest+gold on warm paper,
  layout unchanged.

## Useful facts gathered
- `text-text-secondary` is used **~100×** (mostly muted body text) — re-pointing
  its token is safe and high-leverage.
- `bg-secondary` (the magenta CTA) appears in: `App.tsx` (4 inline buttons —
  both Saves, FAB halves), `SaveScenarioModal`, `AuthModal`, `ProGate`,
  `ScenarioLibrary`, `QuickSelectYears`, NavTab active border/text. These are
  the Phase 2 `Button` consolidation targets.
- `bg-primary`/`text-primary` ≈ 11 spots (h1, FrontierView run button, Study
  toggles, About headings).
