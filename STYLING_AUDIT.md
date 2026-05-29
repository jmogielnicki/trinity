# Styling audit — live app vs. Evergreen prototype

Comparison of the current app against the approved Evergreen prototype
(`/optiona`, preserved at commit `8e32c7d:src/proto/`). Captured all three tabs
at desktop (1280) + mobile (390), top and scrolled-to-bottom.

## STATUS: ✅ ALL RESOLVED

The gaps below were found after Phase 5 and have since been fixed (commits
`ce8d4c6` #1+#2, `8e8a243` #3+#4, `c428761` #5–7) and re-verified by a second
screenshot pass against the prototype: the live app now matches the proto's
color story, depth, type, and finish at desktop + mobile, including the
scroll-collapsed header state. Items #8–9 were intentionally left as-is
(by-design product choices, not styling gaps). Original findings kept below as
the record.

---

## High impact — breaks the Evergreen "story"

### 1. Success donut is blue, not forest-green
- **Live:** the headline "96% success" donut uses the *survived* outcome color
  (`#2c5282`, cold blue) for both the ring and the big number, with the
  *depleted* red as the track.
- **Proto:** forest-green ring + green number on a neutral track — success reads
  as "good = brand."
- **Why it matters:** this is the single most prominent number on the page and
  it's off-palette. The blue is a leftover from the old scheme.
- **Where:** `StatPanel.tsx` `SuccessDonut` (uses `OUTCOME.survived/depleted`).

### 2. Asset-class colors never moved to Evergreen
- **Live:** stocks = purple `#372554`, bonds = orange `#E99C20`, cash = dark
  green `#3F612D` (the original palette — we deliberately left chart *data*
  colors untouched in Phase 1/3).
- **Proto:** stocks = forest `#14513A`, bonds = gold `#C2872B`, cash = sage
  `#7CA98C` — a cohesive Evergreen set.
- **Why it matters:** the allocation bar (sidebar) and every sleeve/area chart
  still show the old purple/orange. It's the biggest remaining "two different
  designs" tell, visible on first load.
- **Caveat:** asset colors are *semantic data*, not chrome — recoloring needs a
  deliberate check that stock/bond/cash stay distinguishable and don't collide
  with the survived/depleted outcome colors. Worth doing, but its own decision.
- **Where:** `--color-stock/bond/cash` in `index.css`.

### 3. No card/elevation hierarchy in the results area
- **Live:** the entire right column (success+stats row **and** both charts) is a
  single flat bordered `Card` (`variant="default"`, border, **no shadow**).
  Everything sits at one depth.
- **Proto:** two distinct **elevated** white cards floating on the paper — a
  "hero" card (donut + stat tiles) and a separate "charts" card — each with
  `shadow-card` and rounded corners. Clear visual grouping + depth.
- **Why it matters:** the proto's sense of "modern product" comes largely from
  this floating-card depth; the live app reads flatter/denser.
- **Where:** `App.tsx` `<main>` (now a single `Card`), `StatPanel.tsx`.

---

## Medium impact — polish gaps

### 4. Stat tiles are flatter than the proto
- **Live:** warm-tint tile, uppercase label, bold tabular value. Good, but no
  **colored left-accent border** and no **sub-label**.
- **Proto:** each tile has a 3px left accent (forest/gold/sage/red) and a
  secondary line ("real, today's $", "worst survivors", "per year",
  "failed at yr 25"), making them scannable and more finished.
- **Where:** `StatPanel.tsx` `Stat`.

### 5. No brand logo mark
- **Live:** wordmark only.
- **Proto:** a forest rounded-square logo tile (↟ glyph) anchors the header.
- **Why it matters:** small, but it's most of what makes the proto header feel
  like a "product" vs. a tool. Low effort, decent payoff.

### 6. Sidebar header & "Save" button differ
- **Live:** plain bold uppercase "STRATEGY"; primary **solid-forest** "Save
  strategy" at the bottom.
- **Proto:** "STRATEGY" eyebrow **+ serif "Build your plan"** heading; a
  **soft/tinted** "Save to library" button (brand-soft bg, forest text) — lower
  visual weight, since the header already has the primary Save.
- **Note:** we have `Button variant="soft"` ready; this is a 1-line swap if we
  want it. Two competing solid-forest Saves (header + sidebar) is a minor
  emphasis clash today.

### 7. Header background tone
- **Live:** sticky header is solid white (`bg-surface`) over the paper body —
  a visible white band.
- **Proto:** header is paper-toned/translucent, so it blends into the page.
- **Minor**, but the white band slightly fights the warm-paper feel.

---

## Low impact / by-design (noting for completeness)

### 8. Tabs have icons (live) vs. text-only (proto)
Live tabs carry small line icons; proto is text-only. Arguably fine — the icons
are tasteful and forest-colored when active. No change recommended unless you
want strict proto parity.

### 9. Sidebar control is a dropdown, not a segmented control
Proto shows a Classic/Glide/Income/Custom **segmented control**; live uses the
`PresetPicker` dropdown ("— a preset or saved strategy —"). These are different
*functional* controls (the live one is a richer preset/saved picker), so this is
a product decision, not a pure styling gap. Likely leave as-is.

---

## Per-tab / responsive notes

- **Build (desktop & mobile):** issues 1–7 all visible here. Mobile is otherwise
  faithful — serif masthead, FAB, warm tiles all good. The collapsed sticky
  header on mobile (wordmark + balance pill + Save) looks clean.
- **Compare (desktop & mobile):** charts now use warm chrome ✓ and per-series
  blue/orange/green data colors are intact ✓. The scenario cards and box-plots
  look consistent. Same flat-vs-elevated card observation (#3) applies to the
  outer panels but is less pronounced here. No new issues.
- **Optimize (desktop & mobile):** the empty/initial "Strategy study" state is
  clean and on-palette; the inner "Start from" panel uses `surface-page` (paper)
  inside the white card, which reads well. Nothing off here. (Didn't drive a
  full study run — the scatter/heatmaps were chart-chrome-tokenized in Phase 3b
  and verified then.)
- **Scrolled-to-bottom:** the collapsing-header behavior works at all sizes;
  legend + quick-select-year buttons at the bottom of Build look consistent.
  No bottom-of-page layout breakage found on any tab.

---

## Suggested fix order (when we act on this)

1. **Donut → forest** (#1) — highest visibility, lowest risk, ~2 lines.
2. **Results elevation** (#3) — split the hero + charts into elevated cards;
   biggest "feels like the proto" win.
3. **Stat tiles: accent border + sub-labels** (#4).
4. **Asset color migration** (#2) — most impactful but needs the
   distinguishability check; treat as its own reviewed change.
5. Logo mark (#5), soft sidebar Save + serif sidebar heading (#6), header tone
   (#7) — quick polish.
