import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: find the element that forces page width (largest min-content child chain) + screenshot. args: slug route width */
const [slug = "demo-salon", route = "/staff/ann", w = "390"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, Number(w), "reduce");
  const page = await ctx.newPage();
  await gotoRetry(page, origin(slug) + route);
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    document.querySelectorAll("main *").forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.right > vw + 0.5 && el.children.length === 0) out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString().split(" ").slice(0, 6).join(".")} R=${r.right.toFixed(1)} W=${r.width.toFixed(1)} ws=${cs.whiteSpace} text='${(el.textContent || "").trim().slice(0, 50)}'`);
    });
    return { sw: document.documentElement.scrollWidth, vw, leaves: out.slice(0, 15) };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-ovf-${slug}${route.replace(/\//g, "_")}-${w}.png`) });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
