# scripts/

Build/dev utilities. Most are `tsx`-run TypeScript wired into `package.json`.

| script | run via | what it does |
| --- | --- | --- |
| `build-data.ts` | `npm run build-data` | CSVs → `public/data/historical.json` |
| `sim.ts` | `npm run sim -- --scenario=…` | CLI simulation harness (golden-master smoke) |
| `migrate.ts` | `npm run db:migrate` | apply `migrations/*.sql` (needs `DATABASE_URL`) |
| `screenshot.mjs` | `npm run screenshot` | capture the running app to PNGs (see below) |

## screenshot.mjs — capturing the app

**For agents: this is the supported way to take screenshots. Use it instead of
writing a throwaway script, and never run `npx playwright install`.**

### Why it exists

This sandbox **cannot reach the Playwright browser CDN** — `npx playwright
install` fails with `403 Host not in allowlist`. Don't try to install browsers.
A Chromium build is **pre-baked into the image** under
`$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`), with a matching Playwright in
the system Node modules (`/opt/node22/lib/node_modules`).

The trap that has repeatedly cost agents time: the repo's *local* devDependency
`playwright` is often a **newer** version than the pre-baked browser revision
(e.g. local `1.60` expects browser rev `1223`, but the image ships rev `1194`).
A bare `import('playwright')` + `chromium.launch()` then throws
`Executable doesn't exist at …`. `screenshot.mjs` handles this automatically:

1. loads the **system** Playwright (version matches the on-disk browser),
   falling back to the local devDependency;
2. launches normally, and if that throws, retries with an explicit
   `executablePath` pointing at whatever `chrome`/`headless_shell` is actually
   present under `$PLAYWRIGHT_BROWSERS_PATH`.

### Usage

```bash
# 1. start the app (background) and wait for it
npm run dev > /tmp/vite.log 2>&1 &
until curl -fs localhost:5173 > /dev/null; do sleep 1; done

# 2. capture
npm run screenshot                                          # localhost:5173, desktop+mobile → /tmp/shot-*.png
node scripts/screenshot.mjs http://localhost:5173/optiona /tmp/opta --viewports=desktop
node scripts/screenshot.mjs http://localhost:5173/ /tmp/opt --selector="text=Optimize strategies" --wait=6000

# 3. view (multimodal Read surfaces the image inline)
#    Read /tmp/shot-desktop.png
```

### Options

```
<url>            default http://localhost:5173/
<outPrefix>      default /tmp/shot   (writes <outPrefix>-<viewport>.png)
--viewports=     comma list: desktop(1280x900) tablet(834x1112) mobile(390x844)
                 or explicit WxH (e.g. 1440x900). default: desktop,mobile
--wait=MS        settle time after networkidle (default 4000). Bump to ~6000 for
                 tab switches — this app has a scroll-linked header animation.
--full           full-page (default). --no-full for viewport-only.
--scale=N        downscale 0<N<=1 (default 0.66; small PNGs render reliably in
                 agent image tools). --scale=1 for full resolution.
--selector=CSS   click this element after load, before capturing (drive the UI)
```

### Reuse the browser-launch logic

For a bespoke capture flow, import the resolver instead of copy-pasting paths:

```js
import { launchBrowser } from './scripts/screenshot.mjs';
const browser = await launchBrowser();   // robust to the version/rev mismatch
// … your own page driving …
await browser.close();
```

### Gotchas

- **Health-check the dev server** (`curl -fs localhost:5173`) before each run —
  the background server occasionally dies; relaunch if down.
- **Drive the page before shooting.** A static landing snapshot misses most
  bugs; use `--selector` to click into the flow under test.
- **View with multimodal `Read`**, not `cat`/`file`.
