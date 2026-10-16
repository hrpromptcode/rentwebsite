import "../../load-env";
import { chromium } from "@playwright/test";
import { origin, newCtx, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: activate the first mobile-nav sheet link with Enter / tap and wait up to 30 s for the navigation. */
async function main() {
  const browser = await chromium.launch();
  for (const slug of process.argv.slice(2)) {
    for (const how of ["Enter", "tap"]) {
      const ctx = await newCtx(browser, 390, "no-preference");
      const page = await ctx.newPage();
      await gotoRetry(page, origin(slug) + "/");
      await page.waitForTimeout(1500);
      const trig = page.locator('header button[aria-label="เปิดเมนู"]').first();
      await trig.click();
      await page.waitForTimeout(800);
      const link = page.locator("[role=dialog] nav a[href]").first();
      const href = await link.getAttribute("href");
      const t0 = Date.now();
      if (how === "Enter") { await link.focus(); await page.keyboard.press("Enter"); } else await link.tap();
      let path = "/";
      while (Date.now() - t0 < 30_000) { path = new URL(page.url()).pathname; if (path !== "/") break; await page.waitForTimeout(250); }
      console.log(`${slug} ${how} ${href}: path=${path} after ${((Date.now() - t0) / 1000).toFixed(1)}s dialogs=${await page.locator("[role=dialog]:visible").count()}`);
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
