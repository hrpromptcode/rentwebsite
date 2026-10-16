import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: Tab (motion on) and report focused elements that stay inside an opacity-0 (unrevealed) block 2 s later; screenshot the first. args: slug route width */
const [slug = "demo-salon", route = "/", w = "1440"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, Number(w), "no-preference");
  const page = await ctx.newPage();
  await gotoRetry(page, origin(slug) + route);
  await page.waitForTimeout(2500);
  let shot = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(2000);
    const r = (await page.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; let op = 1, anc = null; for (let a = el; a; a = a.parentElement) { const o = parseFloat(getComputedStyle(a).opacity); if (o < op) { op = o; anc = a; } } const b = el.getBoundingClientRect(); return { el: el.tagName.toLowerCase() + " '" + (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30) + "'", rect: [b.left, b.top, b.width, b.height].map(Math.round), vh: innerHeight, op, anc: anc ? anc.tagName.toLowerCase() + "[data-reveal=" + anc.getAttribute("data-reveal") + "] top=" + Math.round(anc.getBoundingClientRect().top) : null }; })()`)) as null | { el: string; rect: number[]; vh: number; op: number; anc: string | null };
    if (r && r.op < 0.5) {
      console.log(`Tab ${i + 1}: focused ${r.el} rect=${JSON.stringify(r.rect)} vh=${r.vh} effectiveOpacity=${r.op} hiddenBy=${r.anc} (2 s after focus)`);
      if (!shot) {
        shot = true;
        await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-focusreveal-${slug}${route.replace(/\//g, "_")}-${w}.png`) });
      }
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
