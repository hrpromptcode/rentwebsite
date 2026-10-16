import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: hero H1 timing + zoomed shots of elements the crawler flagged for Thai ink clipping.
 *  tsx qa/bughunt/responsive_b2-peek.ts demo-shop / 390 no-preference */
const [slug = "demo-shop", route = "/", w = "390", rm = "no-preference"] = process.argv.slice(2);

async function main() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, Number(w), rm as "reduce");
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.goto(origin(slug) + route, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
  await page.waitForSelector("h1", { timeout: 120_000 });
  for (let i = 0; i < 14; i++) {
    const st = await page.evaluate(`(() => { const h = document.querySelector("h1"); const ws = [...h.querySelectorAll("[data-reveal-word]")]; const op = ws.map(w => getComputedStyle(w).opacity).join(","); return { n: ws.length, op, h1op: getComputedStyle(h).opacity, ready: document.readyState, hydrated: !!document.querySelector("[data-reveal-word]") }; })()`).catch((e) => String(e));
    console.log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(st));
    await page.waitForTimeout(500);
  }
  await gotoRetry(page, origin(slug) + route);
  await page.waitForTimeout(3000);
  const tag = `${slug}${route.replace(/\//g, "_")}-${w}-${rm}`;
  const h1 = page.locator("h1").first();
  await h1.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await h1.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-h1-${tag}.png`) });
  const clip = page.locator("h3.line-clamp-2").first();
  if (await clip.count()) {
    await clip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const b = (await clip.boundingBox())!;
    await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-cardtitle-${tag}.png`), clip: { x: b.x - 4, y: b.y - 8, width: Math.min(b.width + 8, 380), height: b.height + 16 } });
  }
  console.log("done", tag);
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
