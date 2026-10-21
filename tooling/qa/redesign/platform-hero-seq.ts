import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
/** Hero morph sequence: screenshots of the first viewport at several times (cd tooling; pnpm exec tsx qa/redesign/platform-hero-seq.ts [w]) */
const w = Number(process.argv[2] ?? 1440);
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768 });
await isolateHmr(ctx);
const page = await ctx.newPage();
await stableGoto(page, "http://localhost:3000/", "load");
for (const t of [1500, 3000, 3000, 3000]) {
  await page.waitForTimeout(t);
  const s = await page.evaluate(() => document.querySelector("[data-scene-status]")?.getAttribute("data-scene-status"));
  const f = path.resolve(process.cwd(), `screenshots/redesign-platform-hero-seq-${Date.now() % 100000}-${w}.png`);
  await page.screenshot({ path: f });
  console.log(s, f);
}
await browser.close();
