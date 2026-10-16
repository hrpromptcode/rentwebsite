import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

/** booking deep-dive (bughunt): reschedule unpaid deposit, ineligible staff preselect, today/past slots, maxAdvance, closed days, mobile wizard. */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
const salon = "http://demo-salon.localhost:3000";
const clinic = "http://demo-clinic.localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const log = (s: string) => console.log(s);
const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const want = (k: string) => !only.length || only.includes(k);

async function newPage(browser: Browser, mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 300)));
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
const bkkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
async function pickDate(page: Page, minOffset: number): Promise<string> {
  await page.locator('button[role="gridcell"]:not([disabled]):not(.animate-pulse)').first().waitFor();
  const labels = (await page.locator('button[role="gridcell"]:not([disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) as string[];
  const today = bkkToday();
  const t = labels.find((d) => (Date.parse(d) - Date.parse(today)) / 86400000 >= minOffset);
  if (!t) throw new Error("no date " + labels.join(","));
  await page.locator(`button[role="gridcell"][aria-label="${t}"]`).click();
  return t;
}
async function pickSlot(page: Page, idx = 0): Promise<string> {
  await page.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
  const chips = page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])");
  await chips.first().waitFor();
  const c = chips.nth(idx);
  const l = (await c.innerText()).trim().slice(0, 5);
  await c.click();
  return l;
}
async function details(page: Page, name: string, phone: string) {
  await page.fill("#bk-name", name);
  await page.fill("#bk-phone", phone);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "ยืนยันการจอง" }).click();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}\?k=/, { timeout: 60_000 });
  await page.getByText("หมายเลขการจอง").waitFor();
  return page.url();
}
async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    log(`ERROR ${name}: ${String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
  }
}
type Days = { days: Array<{ date: string; available: boolean; count: number }> };

async function main() {
  const browser = await chromium.launch();
  const { page: s, errs: sErrs } = await newPage(browser);

  if (want("resched"))
    await run("resched", async () => {
      await s.goto(`${salon}/book?service=hot-stone`);
      await s.getByText("เลือกผู้ให้บริการ").waitFor();
      await s.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }).click();
      const d = await pickDate(s, 5);
      const t = await pickSlot(s, 0);
      await details(s, "คิวเอ เลื่อนมัดจำ", "0861112222");
      const u1 = await confirm(s);
      const b1 = await body(s);
      log(`T1 booked ${d} ${t} ${u1.replace(salon, "")} pending=${b1.includes("รอชำระมัดจำ")} panel=${b1.includes("ยอดที่ต้องชำระ")}`);
      await s.getByRole("button", { name: "เลื่อนนัด" }).click();
      await s.getByText("เลือกวันและเวลาใหม่").waitFor();
      const d2 = await pickDate(s, 7);
      const t2 = await pickSlot(s, 1);
      await s.getByRole("button", { name: /ยืนยันเลื่อนเป็น/ }).click();
      await s.waitForURL((u) => /\/bookings\/[0-9a-f-]{36}\?k=/.test(u.href) && u.href !== u1, { timeout: 60_000 });
      await s.getByText("หมายเลขการจอง").waitFor();
      const b2 = await body(s);
      log(`T1 rescheduled → ${d2} ${t2} ${s.url().replace(salon, "")}`);
      log(`T1 new page: pending=${b2.includes("รอชำระมัดจำ")} panel=${b2.includes("ยอดที่ต้องชำระ")} expiredCard=${b2.includes("QR ชำระมัดจำหมดอายุแล้ว")} qr=${await s.locator('img[alt="PromptPay QR"]').count()}`);
      await s.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-resched-unpaid.png"), fullPage: true });
      if (b2.includes("QR ชำระมัดจำหมดอายุแล้ว")) {
        await s.getByRole("button", { name: /สร้าง QR ใหม่/ }).click();
        await s.getByText("แนบสลิปโอนเงิน").waitFor({ timeout: 30_000 });
        await s.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
        await s.getByText("ชำระเงินสำเร็จ").waitFor({ timeout: 30_000 });
        await s.reload();
        const b3 = await body(s);
        log(`T1 after renew+slip: confirmed=${b3.includes("ยืนยันแล้ว")} depositPaid=${b3.includes("ชำระมัดจำแล้ว")}`);
      }
    });

  if (want("staff"))
    await run("staff", async () => {
      const { page: c } = await newPage(browser, true);
      await c.goto(`${clinic}/book?service=botox&staff=dr-kan`);
      await c.getByRole("heading", { level: 1, name: "จองคิวออนไลน์" }).waitFor();
      await c.waitForTimeout(1500);
      const t = await body(c);
      log(`T2 botox+dr-kan: staffStep=${t.includes("เลือกผู้ให้บริการ")} dateStep=${t.includes("เลือกวันที่สะดวก")} kanShown=${t.includes("นพ.กันต์")} nichaShown=${t.includes("พญ.ณิชา")}`);
      await c.goto(`${clinic}/book?service=pico&staff=dr-pim`);
      await c.waitForTimeout(1500);
      const t2 = await body(c);
      log(`T2 pico+dr-pim(dentist): staffStep=${t2.includes("เลือกผู้ให้บริการ")} dateStep=${t2.includes("เลือกวันที่สะดวก")} pimShown=${t2.includes("ทพญ.พิมพ์ชนก")}`);
      const r = await inPage(c, `/api/booking/slots?date=2026-10-20&service=01a1401b-c289-77e9-b6db-0f1d18bb2068&staff=01a1401b-c2d8-73e5-a02e-b58222caa260`);
      log(`T2 api botox+kan → ${r.status} ${r.text.slice(0, 80)}`);
      await c.context().close();
    });

  if (want("days"))
    await run("days", async () => {
      await s.goto(`${salon}/services`);
      const today = bkkToday();
      const now = Date.now();
      const r = JSON.parse((await inPage(s, `/api/booking/slots?date=${today}&service=01a1401b-ad12-7546-8f7f-bb020e71d441`)).text) as { slots: Array<{ start: string; available: boolean }> };
      const early = r.slots.filter((x) => Date.parse(x.start) < now + 3600_000);
      log(`T3 today ${today} thai-60 slots=${r.slots.length} first=${r.slots[0]?.start} earlierThanNow+1h=${early.length}`);
      const nov = JSON.parse((await inPage(s, `/api/booking/days?month=2026-11&service=01a1401b-ad12-7546-8f7f-bb020e71d441`)).text) as Days;
      log(`T4 salon maxAdvance 30: last available Nov day = ${nov.days.filter((d) => d.available).map((d) => d.date).pop()}`);
      const dec = JSON.parse((await inPage(s, `/api/booking/days?month=2026-12&service=01a1401b-ad12-7546-8f7f-bb020e71d441`)).text) as Days;
      log(`T4 salon Dec available days = ${dec.days.filter((d) => d.available).length}`);
      const ann = JSON.parse((await inPage(s, `/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-ad3925d2bf73`)).text) as Days;
      log(`T6c salon ann Mondays: ${ann.days.filter((d) => new Date(d.date + "T12:00:00Z").getUTCDay() === 1).map((d) => d.date + "=" + d.available).join(" ")}`);
      await s.goto(`${clinic}/services`);
      const oct = JSON.parse((await inPage(s, `/api/booking/days?month=2026-10&service=01a1401b-c289-77e9-b6db-08ae969d8682`)).text) as Days;
      log(`T6 clinic consult Sundays: ${oct.days.filter((d) => new Date(d.date + "T12:00:00Z").getUTCDay() === 0).map((d) => d.date + "=" + d.available).join(" ")}`);
    });

  if (want("calendar"))
    await run("calendar", async () => {
      await s.goto(`${salon}/book?service=thai-60&staff=ann`);
      await s.getByText("เลือกวันที่สะดวก").waitFor();
      await s.locator('button[role="gridcell"]:not(.animate-pulse)').first().waitFor();
      const btns = await s.locator("main button[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      log(`T5 calendar aria buttons: ${btns.filter((x) => !/^\d{4}-/.test(x ?? "")).join(", ")}`);
      const nextBtn = s.locator("main button[aria-label*='ถัดไป'], main button[aria-label*='Next'], main button[aria-label*='next']").first();
      const labels: string[] = [];
      for (let i = 0; i < 3; i++) {
        const dis = await nextBtn.isDisabled().catch(() => true);
        labels.push(`m${i}:nextDisabled=${dis}`);
        if (dis) break;
        await nextBtn.click();
        await s.waitForTimeout(2000);
        const en = (await s.locator('button[role="gridcell"]:not([disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) as string[];
        labels.push(`enabled=${en.length}${en.length ? ` last=${en[en.length - 1]}` : ""}`);
      }
      log(`T5 calendar nav: ${labels.join(" ")}`);
    });

  if (want("mobile"))
    await run("mobile", async () => {
      const { page: m, errs } = await newPage(browser, true);
      await m.goto(`${salon}/book`);
      await m.getByRole("heading", { level: 1, name: "จองคิวออนไลน์" }).waitFor();
      const ov = async () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const small = async (sel: string) =>
        m.evaluate(
          (q) =>
            Array.from(document.querySelectorAll<HTMLElement>(q))
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && (r.height < 44 || r.width < 44);
              })
              .map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 20)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
          sel,
        );
      log(`M1 /book service step overflow=${await ov()} small=${(await small("main button")).slice(0, 8).join("; ")}`);
      await m.locator("button[aria-pressed]", { hasText: "นวดไทยโบราณ 60 นาที" }).first().click();
      await m.getByText("เลือกผู้ให้บริการ").waitFor();
      log(`M2 staff step overflow=${await ov()} small=${(await small("main button")).slice(0, 8).join("; ")}`);
      await m.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }).click();
      await m.locator('button[role="gridcell"]:not(.animate-pulse)').first().waitFor();
      log(`M3 date step overflow=${await ov()} small=${(await small("main button")).slice(0, 10).join("; ")}`);
      await m.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-m-calendar.png") });
      await pickDate(m, 2);
      await m.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
      await m.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).first().waitFor();
      log(`M4 time step overflow=${await ov()} small=${(await small("main button")).slice(0, 10).join("; ")}`);
      await m.screenshot({ path: path.join(SHOTS, "bughunt-storefront_booking_restaurant-m-slots.png") });
      await pickSlot(m, 0);
      await m.getByText("ข้อมูลสำหรับติดต่อ").waitFor();
      log(`M5 details overflow=${await ov()} small=${(await small("main button, main input")).slice(0, 10).join("; ")}`);
      log(`M errors: ${[...new Set(errs)].join(" || ").slice(0, 600)}`);
      await m.context().close();
    });

  log(`salon page errors: ${[...new Set(sErrs)].join(" || ").slice(0, 800)}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
