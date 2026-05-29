# Styling Plan — "Evergreen" restyle + centralized design tokens

> **Status:** approved direction = **Evergreen** (Option A). Prototypes live at
> `/optiona` `/optionb` `/optionc` (see `src/proto/`). This document is the
> source of truth for the restyle; the prototype theme block in
> `src/proto/proto.css` is the spec the Phase 1 token layer is seeded from.

## 1. Why

The app's structure is good (dual-chart results, success donut, collapsing
header), but the surface undersells it:

- **No color story** — one navy + one magenta accent on white/gray; the accent
  reads as arbitrary rather than a brand.
- **Flat, uniform panels** — nearly everything is
  `bg-surface border border-border rounded-lg p-4`, so the 95%-success number
  carries the same visual weight as a form field. No hierarchy.
- **Timid buttons** — small white outline buttons; primary actions don't look
  primary. The "Save" button is re-implemented inline in `App.tsx` 4 times.
- **One typeface, small scale** — `system-ui` only, scale tops out at 22px, no
  display face, no tabular/mono figures (a finance tool wants aligned numbers).
- **Cramped proportions** — dense 13px body, tight padding; reads "spreadsheet."

The token plumbing already exists (`@theme` in `src/index.css`, `colors.ts`
reading tokens via `getComputedStyle`) — it's just under-used, with many
inline `rgba(...)`/`#hex` values and ad-hoc radii scattered through components.

## 2. The chosen look — Evergreen

Premium, editorial, calm. Authoritative without being cold.

| Role | Value | Notes |
| --- | --- | --- |
| Brand (primary) | `#14513A` forest | titles, primary CTAs, active states |
| Brand hover | `#1E6B4D` | |
| Accent | `#C2872B` gold | sparing — stat accents, highlights |
| Positive / survived | `#1F7A52` | |
| Negative / depleted | `#BE4A30` | |
| Page background | `#F4F1E9` warm paper | |
| Surface / card | `#FFFFFF` → `#F1EDE3` → `#E8E2D4` | 3 elevations |
| Text | `#1B2A23` → `#586A60` → `#8B968C` | ink → muted → faint |
| Border | `#E4DECF` → `#D4CBB6` | base → strong |
| Display font | Iowan Old Style / Palatino / Georgia serif | headings |
| Body font | system sans | |
| Numerals | monospace, **tabular** | all figures align |

## 3. Architecture — how centralization works

Three layers, each with one clear job:

1. **Tokens (`src/index.css` `@theme`)** — the *only* place raw values live.
   Colors, radii, shadows, font families, type scale. Tailwind v4 generates
   utilities from these (`bg-brand`, `text-text-muted`, `rounded-lg`,
   `font-serif`, `shadow-card`, …). Changing the brand hue, corner radius, or
   heading font is a **one-line edit here** that flows everywhere.
2. **Chart colors (`src/components/colors.ts`)** — already reads tokens via
   `getComputedStyle`. Stays as-is; keeps charts in sync with the token layer
   automatically.
3. **Component primitives (`src/components/ui/`)** — `Card`, `Button`, etc.
   encode *shape and behavior* (variants, padding, focus ring) but pull all
   color/spacing from tokens. Components compose primitives instead of
   re-deriving `bg-surface border …` strings.

**Theming / future dark mode:** the canonical (Evergreen) values live in
`@theme`. A second theme becomes an override block —
`[data-theme="midnight"] { --color-brand: …; }` — with no component changes.
`<html data-theme="evergreen">` is set for forward-compatibility.

**DRY guardrail:** after Phase 3, grepping `src/` (excluding `index.css` and
`proto/`) for `#` hex colors or `rgba(` should return ≈nothing.

## 4. Phases

Phases 1–2 are **theme-agnostic plumbing**; Evergreen only "drops in" via the
token values. Each phase ends green (`npm run build`) and is screenshot-diffed
against the baselines captured at the start of this work.

### Phase 1 — Token layer  ← *in progress*
- Rewrite the `@theme` block in `src/index.css`:
  - Add semantic **role tokens**: `--color-brand`, `--color-brand-ink`,
    `--color-brand-hover`, `--color-brand-soft`, `--color-accent`,
    `--color-accent-soft`, `--color-positive`, `--color-negative`,
    `--color-surface-2`, `--color-surface-3`, `--color-border-strong`,
    `--color-ring`.
  - **Re-point existing tokens** (`--color-primary`, `--color-secondary`,
    surfaces, borders, text, status) to the Evergreen palette so current
    utility classes shift to Evergreen with **zero component edits**.
  - Add **font-family** tokens (`--font-sans`, `--font-serif`, `--font-mono`),
    a curated **radius scale**, larger **type-scale** steps (`--text-2xl`,
    `--text-3xl`), and warm-tinted **shadows**.
  - Set `<html data-theme="evergreen">` and base body `font-family` to
    `var(--font-sans)`.
- **Deferred to later phases:** asset/outcome **chart** tokens stay unchanged
  in Phase 1 (charts read them via `colors.ts`); aligning the chart palette to
  Evergreen is a Phase 4/5 decision so chart semantics don't shift unreviewed.
- **Done when:** app renders in the Evergreen palette, nothing visually broken,
  build + typecheck green.

### Phase 2 — Component primitives (kill repetition)
- Harden the primitives already prototyped in `src/proto/mock.tsx` into
  `src/components/ui/`: `Card` (variants: `elevated` / `muted`, replaces the
  ~dozen `bg-surface border border-border rounded-lg p-4` repeats), `Button`
  (`primary` / `soft` / `ghost` — replaces `Btn.tsx` **and** the 4 inline
  buttons in `App.tsx`: both Saves, the `?`, the FAB), `SectionHeading` /
  `Eyebrow`, `Stat`, `Pill`.
- Migrate `NavTab` / `ToggleButton` / `TabBar` / `IconButton` / `StepSlider`
  onto the role tokens.

### Phase 3 — Sweep hardcodes
- Replace inline `rgba(0,0,0,…)` shadows, `#666`, `#f0f0f0`, ad-hoc radii with
  token utilities. Enforce the DRY guardrail above.

### Phase 4 — Typography & proportions
- Wire the serif display face on headings; set tabular mono figures on all
  numbers; increase base size and panel padding; establish vertical rhythm.
  This does most of the "feels modern" lift.

### Phase 5 — Apply across surfaces & verify
- Header, sidebar, results, Compare, Optimize, modals, mobile drawer/FAB.
- Optionally align the chart palette to Evergreen.
- Screenshot-diff every surface at desktop + mobile against baselines.
- Decide the fate of `src/proto/` (keep as living reference, or remove).

## 5. Tooling note (screenshots)

Headless Chromium is **pre-baked** in the image — do not `npx playwright
install` (the CDN is blocked by network policy). Use the system Playwright with
the bundled browser:

```js
process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { createRequire } = require('module');
const require2 = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require2('playwright');
await chromium.launch({ headless: true, args: ['--no-sandbox'] });
```
