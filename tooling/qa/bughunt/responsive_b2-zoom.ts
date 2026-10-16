import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { SHOTS, origin, gotoRetry, isolateHmr } from "./responsive_b2-lib";

/** responsive_b2: 3x shot of the nth element matching a selector (with its clipping box outlined). args: slug route width rm selector [nth] [name] */
const [slug = "demo-shop", route = "/", w = "390", rm = "reduce", selector = "h1", nth = "0", name = "el"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(w) < 768 ? 844 : 900 }, deviceScaleFactor: 3, reducedMotion: rm as "reduce", isMobile: Number(w) < 768, hasTouch: Number(w) < 768 });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, origin(slug) + route);
  await page.waitForTimeout(3000);
  const el = page.locator(selector).nth(Number(nth));
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const b = (await el.boundingBox())!;
  console.log("box", JSON.stringify(b), await el.evaluate((e) => { const cs = getComputedStyle(e); return `fs=${cs.fontSize} lh=${cs.lineHeight} ov=${cs.overflow} h=${(e as HTMLElement).offsetHeight} sh=${e.scrollHeight} font=${cs.fontFamily.slice(0, 50)} text='${(e.textContent || "").trim().slice(0, 60)}'`; }));
  const vw = page.viewportSize()!.width;
  const x = Math.max(0, b.x - 6), y = Math.max(0, b.y - 10);
  await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-${name}.png`), clip: { x, y, width: Math.min(b.width + 12, vw - x), height: b.height + 20 } });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
