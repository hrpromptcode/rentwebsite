import path from "node:path";
import { createRequire } from "node:module";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * "Daybreak" light home verification (tooling/qa/redesign/platform-light.md):
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/platform-light-shots.ts [--pages=home,templates] [--w=1440,390]
 *        [--frames] [--reduce] [--nogl] [--nofull] [--step=0.85]
 * → tooling/screenshots/pf-light-<page>[-reduce|-nogl]-<w>.png (full page) and pf-light-<page>[…]-fNN-<w>.png (frames)
 * Prints console errors / hydration warnings / horizontal overflow / canvas statuses per page.
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);
const PAGES: Record<string, string> = {
  home: "/",
  templates: "/templates",
  "tpl-shop": "/templates/shop",
  features: "/features",
  pricing: "/pricing",
  notfound: "/this-page-does-not-exist",
};
const only = (arg("pages") ?? "home").split(",").filter(Boolean);
const widths = (arg("w") ?? "1440,390").split(",").map(Number);
const STEP = Number(arg("step") ?? 0.85);
const FRAMES = flag("frames");
const REDUCE = flag("reduce");
const NOGL = flag("nogl");
const FULL = !flag("nofull");
const SHOTS = path.resolve(process.cwd(), "screenshots");
const suffix = REDUCE ? "-reduce" : NOGL ? "-nogl" : "";

// sharp ships with next; stitch full-page captures taller than Chromium's 16384px texture limit from ≤ 8000px clips
const req = createRequire(path.resolve(process.cwd(), "../apps/web/node_modules/next/package.json"));
let sharp: typeof import("sharp") | null = null;
try {
  sharp = req("sharp") as typeof import("sharp");
} catch {
  sharp = null;
}
async function fullShot(page: Page, file: string) {
  const { w, h } = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  if (h <= 16000 || !sharp) {
    await page.screenshot({ path: file, fullPage: true });
    return;
  }
  const parts: { input: Buffer; top: number; left: number }[] = [];
  for (let y = 0; y < h; y += 8000) {
    const hh = Math.min(8000, h - y);
    parts.push({ input: await page.screenshot({ fullPage: true, clip: { x: 0, y, width: w, height: hh } }), top: y, left: 0 });
  }
  await sharp({ create: { width: w, height: h, channels: 3, background: "#fcfbff" } }).composite(parts).png().toFile(file);
}

const args = NOGL ? ["--disable-3d-apis", "--disable-webgl"] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"];
const browser = await chromium.launch({ args });

async function walk(page: Page, name: string, w: number) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => window.innerHeight);
  let i = 0;
  for (let y = 0; y < h; y += Math.round(vh * (FRAMES ? STEP : 0.6))) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(FRAMES ? 1100 : 260);
    if (FRAMES) {
      await page.screenshot({ path: path.join(SHOTS, `pf-light-${name}${suffix}-f${String(i).padStart(2, "0")}-${w}.png`) });
      i++;
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1400);
}

try {
  for (const w of widths) {
    for (const [name, url] of Object.entries(PAGES)) {
      if (only.length && !only.includes(name)) continue;
      const mobile = w < 768;
      const ctx = await browser.newContext({
        viewport: { width: w, height: mobile ? 844 : 900 },
        deviceScaleFactor: 1,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: REDUCE ? "reduce" : "no-preference",
      });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m: ConsoleMessage) => {
        const t = m.text();
        if (m.type() === "error" || /hydrat|did not match|mismatch/i.test(t)) errors.push(`[${m.type()}] ${t.slice(0, 300)}`);
      });
      page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
      const res = await stableGoto(page, `http://localhost:3000${url}`, "load");
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1800);
      if (FRAMES || FULL) await walk(page, name, w);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        height: document.documentElement.scrollHeight,
        scenes: Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status")),
        h1: Array.from(document.querySelectorAll("h1")).map((h) => h.textContent?.replace(/[​⁠]/g, "").trim().slice(0, 60)),
      }));
      if (FULL) await fullShot(page, path.join(SHOTS, `pf-light-${name}${suffix}-${w}.png`));
      console.log(`${name} @${w}: HTTP ${res?.status()} h=${info.height} overflow=${info.overflow} scenes=${info.scenes.join(",")} h1=${JSON.stringify(info.h1)} errors=${errors.length}`);
      for (const e of errors.slice(0, 8)) console.log("   ", e);
      await page.close();
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
