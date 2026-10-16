import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { getAdminDb, sql } from "@rentweb/db";

/** restaurant: sold-out item in an existing cart + live order tracker (status changed in DB, tracker must update). */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
const BASE = "http://demo-restaurant.localhost:3000";
const ITEM = "01a14020-171c-7421-bc97-5b096ccbe1f1"; // แกงจืดเต้าหู้หมูสับ
const log = (s: string) => console.log(s);
const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const want = (k: string) => !only.length || only.includes(k);
const body = (p: Page) => p.evaluate(() => document.body.innerText);

async function main() {
  const db = getAdminDb();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30_000);
  p.setDefaultNavigationTimeout(90_000);

  if (want("soldout")) {
    try {
      await p.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: /แกงจืดเต้าหู้หมูสับ/ }).first().click();
      const dlg = p.getByRole("dialog");
      await dlg.waitFor();
      const groups = dlg.getByRole("radiogroup");
      for (let i = 0; i < (await groups.count()); i++) await groups.nth(i).getByRole("radio").first().click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await dlg.waitFor({ state: "hidden" });
      await db.execute(sql`update menu_items set sold_out = true where id = ${ITEM}`);
      await p.reload({ waitUntil: "networkidle" });
      const card = p.getByRole("button", { name: /แกงจืดเต้าหู้หมูสับ/ }).first();
      log(`S1 card disabled=${await card.isDisabled()} label="${await card.getAttribute("aria-label")}"`);
      const bar = p.locator("[data-rw-cartbar] button");
      log(`S2 cart bar after sold-out: "${await bar.getAttribute("aria-label").catch(() => "none")}"`);
      await bar.click();
      const sheetTxt = await body(p);
      log(`S3 sheet mentions sold-out: ${/หมด/.test(sheetTxt)}`);
      await p.goto(`${BASE}/order`, { waitUntil: "networkidle" });
      await p.locator("[data-rw-cartbar] button").click();
      const d2 = p.getByRole("dialog");
      await d2.getByRole("button", { name: /ดำเนินการต่อ/ }).click();
      await p.waitForTimeout(800);
      await d2.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio").first().click();
      await d2.locator('input[name="name"]').fill("คิวเอ ของหมด");
      await d2.locator('input[name="phone"]').fill("0812345679");
      const cash = d2.getByRole("radio", { name: /เงินสด|ชำระเมื่อมารับ/ });
      if (await cash.count()) await cash.first().click();
      await d2.locator('button[type="submit"]').last().click();
      await p.waitForTimeout(4000);
      const alerts = await p.locator('[role="alert"]').allInnerTexts();
      log(`S4 checkout with sold-out line → url=${p.url().replace(BASE, "")} alerts=${alerts.join(" | ")}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-r-soldout.png") });
    } catch (e) {
      log(`ERROR soldout: ${String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
    } finally {
      await db.execute(sql`update menu_items set sold_out = false where id = ${ITEM}`);
      log("S reverted sold_out=false");
    }
  }

  if (want("tracker")) {
    const num = process.argv[3] ?? "R-1020";
    const phone = process.argv[4] ?? "0812345678";
    try {
      await p.goto(`${BASE}/orders/r/${num}?p=${phone}`, { waitUntil: "networkidle" });
      const before = (await body(p)).match(/(ได้รับออเดอร์แล้ว|รับออเดอร์|กำลังปรุง|พร้อมรับ|เสร็จสิ้น)[^\n]*/)?.[0];
      await db.execute(sql`update restaurant_orders set status = 'preparing' where number = ${num} and tenant_id = '01a14020-1268-741c-8c59-82ec1eb9fae2'`);
      const t0 = Date.now();
      const ok = await p.waitForFunction(() => /กำลังทำ/.test(document.querySelector('li[aria-current="step"]')?.textContent ?? ""), null, { timeout: 45_000 }).then(() => true).catch(() => false);
      log(`T1 tracker ${num}: before="${before}" → preparing visible=${ok} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-r-tracker.png") });
    } catch (e) {
      log(`ERROR tracker: ${String((e as Error).message).slice(0, 300)}`);
    } finally {
      await db.execute(sql`update restaurant_orders set status = 'received' where number = ${num} and tenant_id = '01a14020-1268-741c-8c59-82ec1eb9fae2'`);
    }
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
