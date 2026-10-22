/**
 * restaurant agent: dark-theme spot check of the night panels (html.dark switches the tenant tokens) + console errors.
 *   cd tooling && pnpm exec tsx qa/redesign/_rr-dark.ts <path...>   → screenshots/redesign-restaurant-dark-<i>-<w>.png
 */
import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const BASE = "http://demo-restaurant.localhost:3000";
const urls = process.argv.slice(2);
const browser = await chromium.launch();
for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, isMobile: w < 768, hasTouch: w < 768, locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  for (const [i, u] of urls.entries()) {
    await stableGoto(page, `${BASE}${u}`, "load");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(1200);
    const f = path.resolve("screenshots", `redesign-restaurant-dark-${i}-${w}.png`);
    await page.screenshot({ path: f });
    console.log(w, u, "errors", errors.length, errors.slice(-2).join(" | "));
  }
  await page.close();
  await ctx.close();
}
await browser.close();
