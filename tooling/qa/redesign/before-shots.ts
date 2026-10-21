import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Creative-direction "before" pass: full-page screenshots of the platform home + home and one inner page per demo.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/redesign/before-shots.ts [--only=shop,topup]
 * → tooling/screenshots/redesign-before-<site>-<w>.png
 */
const ONLY = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean));
const SHOTS = path.resolve(process.cwd(), "screenshots");
const PAGES: [string, string][] = [
  ["platform", "http://localhost:3000/"],
  ["shop", "http://demo-shop.localhost:3000/"],
  ["shop-products", "http://demo-shop.localhost:3000/products"],
  ["topup", "http://demo-topup.localhost:3000/"],
  ["topup-game", "http://demo-topup.localhost:3000/games/rov"],
  ["clinic", "http://demo-clinic.localhost:3000/"],
  ["clinic-services", "http://demo-clinic.localhost:3000/services"],
  ["restaurant", "http://demo-restaurant.localhost:3000/"],
  ["restaurant-menu", "http://demo-restaurant.localhost:3000/menu"],
  ["salon", "http://demo-salon.localhost:3000/"],
  ["salon-gallery", "http://demo-salon.localhost:3000/gallery"],
  ["corporate", "http://demo-corporate.localhost:3000/"],
  ["corporate-work", "http://demo-corporate.localhost:3000/work"],
  ["cafe", "http://demo-cafe.localhost:3000/"],
  ["cafe-products", "http://demo-cafe.localhost:3000/products"],
  ["course", "http://demo-course.localhost:3000/"],
  ["course-schedule", "http://demo-course.localhost:3000/schedule"],
  ["hotel", "http://demo-hotel.localhost:3000/"],
  ["hotel-rooms", "http://demo-hotel.localhost:3000/rooms"],
  ["events", "http://demo-events.localhost:3000/"],
  ["events-list", "http://demo-events.localhost:3000/events"],
];
const VPS = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } } as const;

const browser = await chromium.launch();
for (const w of [1440, 390] as const) {
  for (const [name, url] of PAGES) {
    if (ONLY.size && !ONLY.has(name.split("-")[0]!) && !ONLY.has(name)) continue;
    const ctx = await browser.newContext({ viewport: VPS[w], deviceScaleFactor: 1 });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    try {
      const res = await stableGoto(page, url, "load");
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 600) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(120);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      const file = path.join(SHOTS, `redesign-before-${name}-${w}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${res?.status()} ${name} ${w} h=${h} errors=${errors.length} ${errors[0] ?? ""}`);
    } catch (e) {
      console.log(`FAIL ${name} ${w} ${(e as Error).message.slice(0, 160)}`);
    }
    await page.close();
    await ctx.close();
  }
}
await browser.close();
