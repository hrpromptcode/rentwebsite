import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";
/** reverify-storefront: the transparent header is white over the dark fullscreen hero and dark again after a client navigation away (and back). */
async function main() {
  const b = await chromium.launch();
  let fails = 0;
  for (const width of [390, 1440]) {
    const ctx = await b.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, isMobile: width < 768, hasTouch: width < 768 });
    await isolateHmr(ctx);
    const p = await ctx.newPage();
    const color = () => p.evaluate(() => getComputedStyle(document.querySelector("header")!).color);
    await stableGoto(p, "http://demo-restaurant.localhost:3000/");
    await p.waitForTimeout(800);
    const home = await color();
    // client navigation (same layout, header persists): use the hero's "ดูเมนู" link
    await p.locator('main a[href="/menu"]').first().click();
    await p.waitForURL(/\/menu$/);
    await p.waitForTimeout(1200);
    const menu = await color();
    await p.goBack();
    await p.waitForURL(/\/$/);
    await p.waitForTimeout(1200);
    const back = await color();
    const ok = home === "rgb(255, 255, 255)" && menu !== "rgb(255, 255, 255)" && back === "rgb(255, 255, 255)";
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"} @${width}: home=${home} → /menu=${menu} → back=${back}`);
    await ctx.close();
  }
  await b.close();
  process.exit(fails ? 1 : 0);
}
main();
