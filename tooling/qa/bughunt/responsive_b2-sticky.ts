import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HERE, SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: sticky elements vs the sticky site header while scrolled (does the header hide part of a stuck element?). */
const CASES: [string, string, number, string][] = [
  ["demo-clinic", "/book", 1440, "aside"],
  ["demo-salon", "/", 1440, "aside"],
  ["demo-cafe", "/cart", 1440, "div.card.lg\\:sticky, div.lg\\:sticky"],
  ["demo-clinic", "/packages/01a1401b-c3ae-70ed-b669-6cf28ba43a6a/buy", 390, "div.card.sticky"],
  ["demo-restaurant", "/menu", 390, "nav.sticky"],
  ["demo-shop", "/products/sofa-throw", 1440, "div.md\\:sticky"],
  ["demo-corporate", "/services", 1440, "div.max-w-3xl.mb-0"],
];
async function main() {
  const browser = await chromium.launch();
  for (const [slug, route, w, sel] of CASES) {
    const ctx = await newCtx(browser, w, "no-preference", path.join(HERE, `responsive_b2-state-${slug}.json`));
    const page = await ctx.newPage();
    await gotoRetry(page, origin(slug) + route);
    await page.waitForTimeout(2000);
    for (const y of [300, 700, 1200]) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(900);
      const r = await page.evaluate((s) => {
        const h = document.querySelector("header")!.getBoundingClientRect();
        const els = [...document.querySelectorAll(s)].filter((e) => ["sticky", "fixed"].includes(getComputedStyle(e).position) || getComputedStyle(e).position === "sticky");
        return { scrollY: Math.round(scrollY), header: [Math.round(h.top), Math.round(h.bottom)], headerPos: getComputedStyle(document.querySelector("header")!).position, els: els.map((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 4).join(".")} pos=${cs.position} top=${cs.top} z=${cs.zIndex} rect=[${Math.round(b.top)},${Math.round(b.bottom)}] hiddenUnderHeader=${Math.max(0, Math.round(h.bottom - b.top))}px`; }) };
      }, sel);
      console.log(`${slug}${route} @${w} ${JSON.stringify(r)}`);
    }
    await page.evaluate(`window.scrollTo(0, 700)`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-sticky-${slug}${route.slice(0, 20).replace(/\//g, "_")}-${w}.png`) });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
