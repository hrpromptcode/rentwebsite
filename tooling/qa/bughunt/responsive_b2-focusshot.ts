import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: Tab until the focused element matches `pred`, then screenshot around it (focus ring visible?). args: slug route width pred name [extraTabs] */
const [slug, route, w, pred, name, extra = "0"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, Number(w), "reduce");
  const page = await ctx.newPage();
  await gotoRetry(page, origin(slug!) + route);
  await page.waitForTimeout(2500);
  let n = -1;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(() => { const el = document.activeElement; return !!el && (${pred}); })()`)) { n = i + 1; break; }
  }
  for (let i = 0; i < Number(extra); i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el), p = getComputedStyle(el.parentElement!);
    return { tag: el.outerHTML.slice(0, 220), rect: [r.x, r.y, r.width, r.height].map(Math.round), fv: el.matches(":focus-visible"), outline: cs.outlineStyle + " " + cs.outlineWidth, shadow: cs.boxShadow.slice(0, 80), parentShadow: p.boxShadow.slice(0, 80), parentBorder: p.borderColor };
  });
  console.log(`tabs=${n}`, JSON.stringify(info));
  const [x, y, ww, hh] = info.rect as number[];
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-focus-${name}.png`), clip: { x: Math.max(0, x! - 30), y: Math.max(0, y! - 30), width: Math.min(ww! + 60, vw - Math.max(0, x! - 30)), height: hh! + 60 } });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
