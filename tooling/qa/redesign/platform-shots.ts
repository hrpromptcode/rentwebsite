import path from "node:path";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Platform showcase verification (docs/design/hi-end-direction.md §4, §9):
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/platform-shots.ts [--pages=home,templates] [--w=1440,390]
 *        [--frames] (viewport frames while scrolling) [--reduce] (prefers-reduced-motion) [--nogl] (no WebGL) [--nofull]
 * → tooling/screenshots/redesign-platform-<page>[-reduce|-nogl]-<w>.png (full page) and …-<page>-f<NN>-<w>.png (frames)
 * Prints console errors / hydration warnings / horizontal overflow / canvas statuses per page.
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);
const PAGES: Record<string, string> = {
  home: "/",
  templates: "/templates",
  "tpl-shop": "/templates/shop",
  "tpl-hotel": "/templates/hotel",
  features: "/features",
  pricing: "/pricing",
  notfound: "/this-page-does-not-exist",
  nosite: "/site-status/no-site?host=example.com",
  suspended: "/site-status/suspended",
};
const only = (arg("pages") ?? "").split(",").filter(Boolean);
const widths = (arg("w") ?? "1440,390").split(",").map(Number);
const FRAMES = flag("frames");
const REDUCE = flag("reduce");
const NOGL = flag("nogl");
const FULL = !flag("nofull");
const SHOTS = path.resolve(process.cwd(), "screenshots");
const suffix = REDUCE ? "-reduce" : NOGL ? "-nogl" : "";

const args = NOGL ? ["--disable-3d-apis", "--disable-webgl"] : ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"];
const browser = await chromium.launch({ args });

async function walk(page: Page, frames: boolean, name: string, w: number) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => window.innerHeight);
  let i = 0;
  for (let y = 0; y < h; y += Math.round(vh * (frames ? 0.85 : 0.6))) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(frames ? 900 : 260);
    if (frames) {
      await page.screenshot({ path: path.join(SHOTS, `redesign-platform-${name}${suffix}-f${String(i).padStart(2, "0")}-${w}.png`) });
      i++;
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
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
      await page.waitForTimeout(1500);
      await walk(page, FRAMES, name, w);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        height: document.documentElement.scrollHeight,
        scenes: Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status")),
        h1: Array.from(document.querySelectorAll("h1")).map((h) => h.textContent?.trim().slice(0, 60)),
      }));
      if (FULL) await page.screenshot({ path: path.join(SHOTS, `redesign-platform-${name}${suffix}-${w}.png`), fullPage: true });
      console.log(`${name} @${w}: HTTP ${res?.status()} h=${info.height} overflow=${info.overflow} scenes=${info.scenes.join(",")} h1=${JSON.stringify(info.h1)} errors=${errors.length}`);
      for (const e of errors.slice(0, 8)) console.log("   ", e);
      await page.close();
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
