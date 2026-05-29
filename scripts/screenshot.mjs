#!/usr/bin/env node
/**
 * screenshot.mjs — capture screenshots of the running app (or any URL).
 *
 * WHY THIS EXISTS / READ ME FIRST
 * --------------------------------
 * This sandbox has **no network access to the Playwright browser CDN**, so the
 * usual `npx playwright install` FAILS with "403 Host not in allowlist". Do NOT
 * try to install browsers. Instead, a Chromium build is **pre-baked into the
 * image** under $PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers), and a matching
 * Playwright lives in the system Node modules (/opt/node22/lib/node_modules).
 *
 * Gotcha that bites every time: the repo's *local* devDependency `playwright`
 * may be a NEWER version than the pre-baked browser revision (e.g. local 1.60
 * wants browser rev 1223, but the image ships rev 1194). A bare
 * `import('playwright')` then throws "Executable doesn't exist…". This script
 * resolves that automatically — it prefers the SYSTEM playwright that matches
 * the on-disk browser, and as a last resort points launch() at whatever
 * chrome/headless_shell binary actually exists. So just run it; don't fight it.
 *
 * USAGE
 *   # 1. start the app (separate shell / background):  npm run dev   (→ :5173)
 *   # 2. capture:
 *   node scripts/screenshot.mjs                         # localhost:5173, desktop+mobile → /tmp/shot-*.png
 *   node scripts/screenshot.mjs http://localhost:5173/optiona /tmp/opta
 *   node scripts/screenshot.mjs <url> <outPrefix> --viewports=desktop,mobile,tablet
 *   node scripts/screenshot.mjs <url> <outPrefix> --wait=3000 --scale=0.66 --full
 *
 * OPTIONS
 *   <url>           default http://localhost:5173/
 *   <outPrefix>     default /tmp/shot   (files written as <outPrefix>-<viewport>.png)
 *   --viewports=    comma list of: desktop(1280x900) tablet(834x1112) mobile(390x844)
 *                   or explicit WxH (e.g. 1440x900). default: desktop,mobile
 *   --wait=MS       extra settle time after networkidle (default 4000)
 *   --full          full-page capture (default true; pass --no-full to disable)
 *   --no-full       viewport-only capture
 *   --scale=N       downscale factor 0<N<=1 (default 0.66). Smaller PNGs render
 *                   reliably in agent image tools; pass --scale=1 for full res.
 *   --selector=CSS  click this element after load, before capturing (e.g. a tab)
 *
 * Programmatic use: `import { launchBrowser } from './screenshot.mjs'` to reuse
 * the browser-resolution logic in a bespoke capture script.
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, writeFileSync } from 'fs';

const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const SYSTEM_MODULES = '/opt/node22/lib/node_modules/';

/** Find an on-disk Chromium executable as a last-resort explicit launch path. */
function findChromeExecutable() {
  if (!existsSync(BROWSERS_PATH)) return null;
  for (const entry of readdirSync(BROWSERS_PATH)) {
    if (entry.startsWith('chromium-')) {
      const p = `${BROWSERS_PATH}/${entry}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  // headless_shell as a secondary option
  for (const entry of readdirSync(BROWSERS_PATH)) {
    if (entry.startsWith('chromium_headless_shell-')) {
      const p = `${BROWSERS_PATH}/${entry}/chrome-linux/headless_shell`;
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Load a `playwright` module, preferring the system install (matches the
 *  pre-baked browser), falling back to the repo-local devDependency. */
function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
  // System first — its version matches the pre-baked browser revision.
  try {
    const reqSystem = createRequire(SYSTEM_MODULES);
    return reqSystem('playwright');
  } catch {
    /* fall through */
  }
  // Local devDependency fallback.
  const reqLocal = createRequire(import.meta.url);
  return reqLocal('playwright');
}

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

/**
 * Launch headless Chromium, robust to a version/revision mismatch between the
 * playwright module and the pre-baked browser. Returns a Playwright Browser.
 */
export async function launchBrowser() {
  const pw = loadPlaywright();
  try {
    return await pw.chromium.launch({ headless: true, args: LAUNCH_ARGS });
  } catch (err) {
    // Typical message: "Executable doesn't exist at …". Retry with an explicit
    // path to whatever browser binary is actually on disk.
    const exe = findChromeExecutable();
    if (!exe) throw err;
    return await pw.chromium.launch({ headless: true, executablePath: exe, args: LAUNCH_ARGS });
  }
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false },
  tablet: { width: 834, height: 1112, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

function parseViewport(name) {
  if (VIEWPORTS[name]) return { name, ...VIEWPORTS[name] };
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (m) return { name, width: +m[1], height: +m[2], isMobile: +m[1] < 600 };
  throw new Error(`Unknown viewport "${name}" (use desktop|tablet|mobile or WxH)`);
}

async function capture(browser, { url, outPrefix, viewport, wait, full, scale, selector }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('  goto:', e.message));
  await page.waitForTimeout(wait);
  if (selector) {
    await page.locator(selector).first().click().catch((e) => console.log('  selector click:', e.message));
    await page.waitForTimeout(wait);
  }
  const raw = await page.screenshot({ fullPage: full });

  let buf = raw;
  if (scale !== 1) {
    // Downscale inside the page via canvas so output PNGs stay small.
    const dataUrl = await page.evaluate(async ({ b64, scale }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }, { b64: raw.toString('base64'), scale });
    buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  }

  const file = `${outPrefix}-${viewport.name}.png`;
  writeFileSync(file, buf);
  console.log('saved', file, `(${viewport.width}x${viewport.height}${full ? ' full' : ''})`);
  await ctx.close();
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(
    args.filter((a) => a.startsWith('--')).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v === undefined ? true : v];
    }),
  );

  const url = positional[0] || 'http://localhost:5173/';
  const outPrefix = positional[1] || '/tmp/shot';
  const viewports = (flags.viewports || 'desktop,mobile').split(',').map(parseViewport);
  const wait = flags.wait ? +flags.wait : 4000;
  const full = flags.full === true ? true : flags['no-full'] ? false : true;
  const scale = flags.scale ? +flags.scale : 0.66;
  const selector = typeof flags.selector === 'string' ? flags.selector : undefined;

  const browser = await launchBrowser();
  try {
    for (const viewport of viewports) {
      await capture(browser, { url, outPrefix, viewport, wait, full, scale, selector });
    }
  } finally {
    await browser.close();
  }
  console.log('done');
}

// Run as CLI (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
