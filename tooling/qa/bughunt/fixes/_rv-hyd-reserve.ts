import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
/** reverify-storefront: replay restaurant-journey 4.1 (deep-link reserve → submit → next deep link) and print hydration diffs in full; cancels what it books. */
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", hasTouch: true, isMobile: true, locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror @ ${page.url()}] ${e.message.slice(0, 5000)}\n-----`));
  page.on("console", (m) => m.type() === "error" && console.log(`[console.error @ ${page.url()}] ${m.text().slice(0, 2500)}\n-----`));
  const BASE = "http://demo-restaurant.localhost:3000";
  const PHONE = "0891234567";
  const url = `${BASE}/reserve?date=2026-12-0${3 + (Date.now() % 5)}&time=19:00&size=4&zone=${encodeURIComponent("สวน")}`;
  const made: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByText("ว่าง สามารถจองได้").waitFor({ timeout: 15000 });
    await page.locator("#res-name").fill(`คุณโพรบ ${i}`);
    await page.locator("#res-phone").fill(PHONE);
    await page.getByRole("button", { name: /ยืนยันการจอง/ }).click();
    await page.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 30000 });
    made.push(page.url().match(/RS-\d+/)![0]);
    console.log("booked", made.at(-1));
  }
  await page.waitForTimeout(2000);
  for (const n of made) {
    await page.goto(`${BASE}/reservations/${n}?p=${PHONE}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "ยกเลิกการจอง" }).click();
    await page.getByRole("button", { name: "แตะอีกครั้งเพื่อยืนยันยกเลิก" }).click();
    await page.getByText("ยกเลิกแล้ว").first().waitFor({ timeout: 15000 });
    console.log("cancelled", n);
  }
  await b.close();
}
main();
