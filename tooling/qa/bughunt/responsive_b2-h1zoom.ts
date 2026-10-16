import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, gotoRetry, isolateHmr } from "./responsive_b2-lib";

/** responsive_b2: 3x zoom shot of the first h1 (and its word wrappers' boxes) to see clipped Thai tone marks. args: slug route width rm */
const [slug = "demo-shop", route = "/", w = "390", rm = "no-preference"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: 844 }, deviceScaleFactor: 3, reducedMotion: rm as "reduce" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, origin(slug) + route);
  await page.waitForTimeout(4000);
  const h1 = page.locator("h1").first();
  const info = await h1.evaluate((h) => {
    const ws = [...h.querySelectorAll("[data-reveal-word]")].slice(0, 12);
    return {
      html: h.outerHTML.slice(0, 600),
      h1: getComputedStyle(h).lineHeight + " fs=" + getComputedStyle(h).fontSize + " font=" + getComputedStyle(h).fontFamily.slice(0, 60),
      words: ws.map((wd) => { const p = wd.parentElement!; const pr = p.getBoundingClientRect(), wr = wd.getBoundingClientRect(); return `${wd.textContent} wrap=[${pr.top.toFixed(1)},${pr.bottom.toFixed(1)}] ov=${getComputedStyle(p).overflow} word=[${wr.top.toFixed(1)},${wr.bottom.toFixed(1)}] tf=${getComputedStyle(wd).transform}`; }),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await h1.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-h1zoom-${slug}${route.replace(/\//g, "_")}-${w}-${rm}.png`) });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
