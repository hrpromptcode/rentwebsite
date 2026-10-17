import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
/** 390px: does the floating LINE button overlap the restaurant cart bar / booking primary buttons? */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(90_000);
  const fabBox = async () => p.locator("a[href*='line.me']").filter({ hasText: /LINE/ }).first().boundingBox().catch(() => null);
  const ov = (a: any, b: any) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const url of ["http://demo-restaurant.localhost:3000/order", "http://demo-restaurant.localhost:3000/t/01a14020-a6-ez9tkj"]) {
    await p.goto(url, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /ชาไทยเย็น/ }).first().click();
    const dlg = p.getByRole("dialog");
    const g = dlg.getByRole("radiogroup");
    for (let i = 0; i < (await g.count()); i++) await g.nth(i).getByRole("radio").first().click();
    await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
    await dlg.waitFor({ state: "hidden" });
    const bar = await p.locator("[data-rw-cartbar] button").boundingBox();
    const fab = await fabBox();
    console.log(`${url.replace(/.*3000/, "")} bar=${JSON.stringify(bar)} fab=${JSON.stringify(fab)} overlap=${ov(bar, fab)}`);
    await p.screenshot({ path: path.join(SHOTS, `bughunt-storefront_booking_restaurant-fab-${url.includes("/t/") ? "table" : "order"}.png`) });
  }
  for (const url of ["http://demo-salon.localhost:3000/book?service=thai-60&staff=nam", "http://demo-clinic.localhost:3000/book?service=consult&staff=dr-kan"]) {
    await p.goto(url, { waitUntil: "networkidle" });
    await p.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)').first().waitFor();
    const fab = await fabBox();
    const btns = await p.locator("main button:visible").evaluateAll((els) => els.map((e) => ({ t: (e as HTMLElement).innerText.trim().slice(0, 20), r: e.getBoundingClientRect().toJSON() })));
    const hits = btns.filter((b) => fab && b.r.x < fab.x + fab.width && fab.x < b.r.x + b.r.width && b.r.y < fab.y + fab.height && fab.y < b.r.y + b.r.height);
    console.log(`${url.replace(/.*localhost:3000/, "")} fab=${JSON.stringify(fab)} buttonsUnderFab(viewport)=${hits.map((h) => h.t).join(",")}`);
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
