import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

/** restaurant deep-dive (bughunt): notes, cart cookie size, LINE FAB overlap, pickup slots, reservation zone/party capacity, far-future reservation. */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
const BASE = "http://demo-restaurant.localhost:3000";
const log = (s: string) => console.log(s);
const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const want = (k: string) => !only.length || only.includes(k);
const RPHONE = "0897776655";

async function newPage(browser: Browser, mobile = true) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 400)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text().slice(0, 300));
  });
  return { ctx, page, errs };
}
const body = (p: Page) => p.evaluate(() => document.body.innerText);
const inPage = (p: Page, url: string) =>
  p.evaluate(async (u) => {
    const r = await fetch(u, { cache: "no-store" });
    return { status: r.status, text: await r.text() };
  }, url);
async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    log(`ERROR ${name}: ${String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 500)}`);
  }
}
const cartBar = (p: Page) => p.locator("[data-rw-cartbar] button");
async function addItem(p: Page, name: RegExp, opts: { radio?: string; note?: string } = {}) {
  await p.getByRole("button", { name }).first().click();
  const dlg = p.getByRole("dialog");
  await dlg.waitFor();
  if (opts.radio) await dlg.getByRole("radio", { name: opts.radio }).click();
  else {
    // pick first option of every required radiogroup
    const groups = dlg.getByRole("radiogroup");
    const n = await groups.count();
    for (let i = 0; i < n; i++) await groups.nth(i).getByRole("radio").first().click();
  }
  if (opts.note) await dlg.locator("textarea").fill(opts.note);
  await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
  await dlg.waitFor({ state: "hidden" });
}
function rectOverlap(a: { x: number; y: number; width: number; height: number } | null, b: { x: number; y: number; width: number; height: number } | null) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function main() {
  const browser = await chromium.launch();

  if (want("menu"))
    await run("menu", async () => {
      const { page: p, ctx, errs } = await newPage(browser);
      await p.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
      const note = "ไม่ใส่ผักชี ไม่เผ็ดมาก แยกน้ำจิ้ม ขอช้อนส้อมเพิ่มสองชุด และขอถุงแยกต่างหากด้วยนะคะ ขอบคุณค่ะ ".repeat(3).slice(0, 200);
      await addItem(p, /แกงเขียวหวานไก่บ้าน/, { radio: "เผ็ดกลาง", note });
      await cartBar(p).waitFor();
      const fab = p.locator("a[href*='line.me'], a:has-text('แชตผ่าน LINE')").first();
      const fabBox = await fab.boundingBox().catch(() => null);
      const barBox = await cartBar(p).boundingBox();
      log(`R1 cartbar=${JSON.stringify(barBox)} lineFab=${JSON.stringify(fabBox)} overlap=${rectOverlap(barBox, fabBox)}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-r-cartbar.png") });
      await cartBar(p).click();
      const sheet = await body(p);
      log(`R1 sheet shows note=${sheet.includes(note.slice(0, 30))}`);
      await p.keyboard.press("Escape");
      // R2 cookie size: more lines with long Thai notes
      const items = [/ต้มยำกุ้งแม่น้ำ/, /ผัดกะเพราเนื้อโคขุน/, /ชาไทยเย็น/, /ข้าวเหนียวมะม่วง/, /บัวลอยไข่หวาน/, /น้ำตะไคร้ใบเตย/];
      for (const [i, re] of items.entries()) {
        await addItem(p, re, { note: `หมายเหตุ${i} ` + note.slice(0, 180) });
      }
      await p.waitForTimeout(500);
      const label = await cartBar(p).getAttribute("aria-label");
      const ck = (await ctx.cookies()).find((c) => c.name === "rw_rcart");
      const docLen = await p.evaluate(() => (document.cookie.match(/(?:^|; )rw_rcart=([^;]*)/)?.[1] ?? "").length);
      log(`R2 before reload: bar="${label}" cookieLen(ctx)=${ck?.value.length ?? "MISSING"} cookieLen(doc)=${docLen}`);
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(800);
      const label2 = await cartBar(p).getAttribute("aria-label").catch(() => "NO CART BAR");
      log(`R2 after reload: bar="${label2}"`);
      log(`R menu errors: ${[...new Set(errs)].join(" || ").slice(0, 500)}`);
      await ctx.close();
    });

  if (want("pickup"))
    await run("pickup", async () => {
      const { page: p, ctx } = await newPage(browser);
      await p.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
      await addItem(p, /ชาไทยเย็น/);
      await p.goto(`${BASE}/order`, { waitUntil: "networkidle" });
      await cartBar(p).click().catch(() => {});
      const dlg = p.getByRole("dialog");
      await dlg.getByRole("button", { name: /ดำเนินการต่อ/ }).click().catch(() => {});
      await p.waitForTimeout(1000);
      const radios = dlg.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio");
      const n = await radios.count();
      const labels = await radios.allInnerTexts();
      log(`R3 pickup slots n=${n} first="${labels[0]?.replace(/\s+/g, " ")}" last="${labels[n - 1]?.replace(/\s+/g, " ")}" now=${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
      await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-r-pickup.png") });
      await ctx.close();
    });

  // reverify-repro 2026-10-17: reservations made by "zone" are collected here and cancelled after the block even when it
  // throws (an aborted run used to leave ~25 bookings blocking demo-restaurant 2026-12-08 12:00)
  const made: string[] = [];
  if (want("zone"))
    await run("zone", async () => {
      const { page: p, ctx } = await newPage(browser, false);
      const date = "2026-12-08";
      const time = "12:00";
      await p.goto(`${BASE}/reserve`, { waitUntil: "networkidle" });
      const cap0 = JSON.parse((await inPage(p, `/api/restaurant/reservations/availability?date=${date}&time=${time}&size=2`)).text) as { capacity: number; booked: number };
      const target = cap0.capacity - cap0.booked;
      for (let i = 0; i < target; i++) {
        await p.goto(`${BASE}/reserve?date=${date}&time=${time}&size=2`, { waitUntil: "networkidle" });
        await p.locator("#res-name").fill(`คิวเอ ไม่ระบุโซน ${i + 1}`);
        await p.locator("#res-phone").fill(RPHONE);
        await p.waitForTimeout(400);
        await p.locator('input[type="hidden"][name="zone"]').evaluate((el) => ((el as HTMLInputElement).value = ""));
        // React may re-render the hidden input; also strip on submit
        await p.evaluate(() => {
          const f = document.querySelector("form");
          f?.addEventListener("formdata", (e) => (e as FormDataEvent).formData.set("zone", ""), { once: true });
        });
        await p.getByRole("button", { name: /ยืนยันการจอง/ }).click();
        const okNav = await p.waitForURL(/\/reservations\/RS-\d+/, { timeout: 30_000 }).then(() => true).catch(() => false);
        if (!okNav) {
          await p.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-r-zone-fail.png"), fullPage: true });
          throw new Error(`submit ${i} failed: disabled=${await p.getByRole("button", { name: /ยืนยันการจอง/ }).isDisabled()} alerts=${(await p.locator('[role="alert"]').allInnerTexts()).join(" | ")}`);
        }
        made.push(p.url().match(/RS-\d+/)![0]);
      }
      const any = JSON.parse((await inPage(p, `/api/restaurant/reservations/availability?date=${date}&time=${time}&size=2`)).text);
      const garden = JSON.parse((await inPage(p, `/api/restaurant/reservations/availability?date=${date}&time=${time}&size=2&zone=${encodeURIComponent("สวน")}`)).text);
      log(`R4 created ${made.length} no-zone reservations ${made.join(",")}; availability any=${JSON.stringify(any)} garden=${JSON.stringify(garden)}`);
      // now a normal storefront booking in the garden
      await p.goto(`${BASE}/reserve?date=${date}&time=${time}&size=2&zone=${encodeURIComponent("สวน")}`, { waitUntil: "networkidle" });
      await p.locator("#res-name").fill("คิวเอ สวนเกิน");
      await p.locator("#res-phone").fill(RPHONE);
      await p.waitForTimeout(1500);
      const btnDisabled = await p.getByRole("button", { name: /ยืนยันการจอง/ }).isDisabled();
      if (!btnDisabled) {
        await p.getByRole("button", { name: /ยืนยันการจอง/ }).click();
        await p.waitForURL(/\/reservations\/RS-\d+/, { timeout: 30_000 }).catch(() => {});
      }
      const extra = p.url().match(/RS-\d+/)?.[0];
      log(`R4 garden booking after all tables taken: buttonDisabled=${btnDisabled} → ${extra ?? "rejected: " + (await body(p)).match(/เต็ม[^\n]*/)?.[0]}`);
      if (extra) made.push(extra);
      // party size ignored: party 40 garden
      await p.goto(`${BASE}/reserve?date=2026-12-09&time=12:00&size=40&zone=${encodeURIComponent("สวน")}`, { waitUntil: "networkidle" });
      await p.locator("#res-name").fill("คิวเอ 40 คน");
      await p.locator("#res-phone").fill(RPHONE);
      await p.waitForTimeout(1500);
      const warn = (await body(p)).match(/[^\n]*(กลุ่มใหญ่|โทร|หลายโต๊ะ|ใหญ่เกิน|ที่นั่ง)[^\n]*/)?.[0];
      // SBR-014 intended: a party larger than the zone's total seats is refused up front (too_large message, no submit)
      const submit = p.getByRole("button", { name: /ยืนยันการจอง/ });
      const canSubmit = (await submit.count()) > 0 && !(await submit.first().isDisabled());
      if (canSubmit) {
        await submit.first().click();
        await p.waitForURL(/\/reservations\/RS-\d+/, { timeout: 30_000 }).catch(() => {});
      } else log(`R5 submit ${(await submit.count()) ? "disabled" : "not offered"}; alerts: ${(await p.locator('p[role="alert"], [role="status"]').allInnerTexts()).join(" | ").slice(0, 200)}`);
      const big = p.url().match(/RS-\d+/)?.[0];
      const after = JSON.parse((await inPage(p, `/api/restaurant/reservations/availability?date=2026-12-09&time=12:00&size=2&zone=${encodeURIComponent("สวน")}`)).text);
      log(`R5 party 40 in garden (4x6 seats): warning="${warn}" → ${big ?? "rejected"}; garden after=${JSON.stringify(after)}`);
      if (big) made.push(big);
      // far future reservation (client max = today+60)
      await p.goto(`${BASE}/reserve?date=2026-12-10&time=12:00&size=2`, { waitUntil: "networkidle" });
      await p.locator("#res-name").fill("คิวเอ อนาคตไกล");
      await p.locator("#res-phone").fill(RPHONE);
      await p.waitForTimeout(800);
      await p.evaluate(() => {
        const f = document.querySelector("form");
        f?.addEventListener("formdata", (e) => (e as FormDataEvent).formData.set("date", "2031-01-15"), { once: true });
      });
      await p.getByRole("button", { name: /ยืนยันการจอง/ }).click();
      await p.waitForURL(/\/reservations\/RS-\d+/, { timeout: 30_000 }).catch(() => {});
      const far = p.url().match(/RS-\d+/)?.[0];
      log(`R6 date 2031-01-15 (form max today+60) → ${far ?? "rejected: " + (await body(p)).match(/[^\n]*(เวลา|วันที่)[^\n]*ไม่[^\n]*/)?.[0]}`);
      if (far) made.push(far);
      await ctx.close();
    });
  if (made.length) {
    const { page: p } = await newPage(browser, false);
    log(`R made: ${made.join(",")}`);
    // cleanup: self-service cancel
    let cancelled = 0;
    for (const n of made) {
      await p.goto(`${BASE}/reservations/${n}?p=${RPHONE}`, { waitUntil: "networkidle" });
      const b = p.getByRole("button", { name: "ยกเลิกการจอง" });
      if (!(await b.count())) continue;
      await b.click();
      await p.getByRole("button", { name: "แตะอีกครั้งเพื่อยืนยันยกเลิก" }).click();
      await p.waitForTimeout(1500);
      cancelled++;
    }
    log(`R cleanup cancelled ${cancelled}/${made.length}`);
  }

  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
