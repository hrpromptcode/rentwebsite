import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
/** reverify-storefront: hydration errors of one page in the restaurant-journey context (390, touch, reduced motion, th-TH).  tsx _rv-hyd-mobile.ts <url> [motion] */
async function main() {
  const [url, motion] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: motion ? "no-preference" : "reduce", hasTouch: true, isMobile: true, locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`[console] ${m.text()}`));
  await page.goto(url!, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  for (const l of logs) console.log(l.slice(0, 3000) + "\n-----");
  if (!logs.length) console.log("no errors");
  await b.close();
}
main();
