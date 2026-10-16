import "../../load-env";
import { chromium } from "@playwright/test";
/** prints full hydration / page errors for given paths: tsx ... <host> <path> [<path>...] */
async function main() {
  const [host, ...paths] = process.argv.slice(2);
  const browser = await chromium.launch();
  for (const mobile of [true, false]) {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: "th-TH", timezoneId: process.env.TZID ?? "Asia/Bangkok", isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
    for (const p of paths) {
      errs.length = 0;
      await page.goto(`http://${host}.localhost:3000${p}`, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForTimeout(1500);
      console.log(`=== ${mobile ? "mobile" : "desktop"} ${p}: ${errs.length} errors`);
      for (const e of [...new Set(errs)]) console.log(e.slice(0, 2500));
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
