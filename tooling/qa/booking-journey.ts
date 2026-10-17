import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Independent QA journey for the booking deliverable (round 1).
 *   pnpm --filter @rentweb/tooling exec tsx qa/booking-journey.ts
 * Drives demo-salon (desktop 1440) and demo-clinic (mobile 390) through the real storefront in Chromium.
 * Prints PASS/FAIL per step, screenshots failing steps to tooling/screenshots/qa-booking-FAIL-<id>.png and
 * writes tooling/qa/booking-journey-results.md. Requires the web dev server on http://localhost:3000.
 */

const PORT = process.env.PORT ?? "3000";
const origin = (slug: string) => `http://${slug}.localhost:${PORT}`;
const SHOTS = path.resolve(process.cwd(), "screenshots");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/* ------------------------------------------------------------------ */
/* harness                                                              */
/* ------------------------------------------------------------------ */

interface Result {
  id: string;
  name: string;
  ok: boolean;
  info?: string;
}
const results: Result[] = [];
const consoleErrors = new Map<string, string[]>();

async function step(id: string, name: string, page: Page | null, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const info = await fn();
    results.push({ id, name, ok: true, info: info ?? undefined });
    console.log(`PASS ${id} ${name}${info ? ` – ${info}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
      .split("\n")
      .slice(0, 3)
      .join(" | ")
      .slice(0, 400);
    results.push({ id, name, ok: false, info: msg });
    console.log(`FAIL ${id} ${name} – ${msg}`);
    if (page && !page.isClosed()) {
      const file = path.join(SHOTS, `qa-booking-FAIL-${id}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`     screenshot: ${file}  url: ${page.url()}`);
    }
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function newPage(browser: Browser, label: string, viewport = DESKTOP): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  const errs: string[] = [];
  consoleErrors.set(label, errs);
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 240)}`));
  page.on("requestfailed", (r) => {
    if (!/favicon/.test(r.url())) errs.push(`requestfailed: ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ""}`);
  });
  return { ctx, page };
}

/* ------------------------------------------------------------------ */
/* Bangkok date helpers                                                 */
/* ------------------------------------------------------------------ */

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function bkkNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* wizard helpers                                                       */
/* ------------------------------------------------------------------ */

async function pickService(page: Page, name: string) {
  await page.locator("button[aria-pressed]", { hasText: name }).first().click();
}
async function pickStaff(page: Page, who: "any" | string) {
  const btn = who === "any" ? page.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ }) : page.locator("button[aria-pressed]", { hasText: who }).first();
  await btn.click();
}
/** waits for the month to load and clicks the first bookable date with offset >= minOffsetDays (skipping `not`) */
async function pickDate(page: Page, opts: { minOffsetDays: number; maxOffsetDays?: number; not?: string | null }): Promise<string> {
  const today = bkkToday();
  const loaded = page.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)');
  await loaded.first().waitFor({ timeout: 30_000 });
  await page.getByText("กำลังตรวจสอบวันว่าง…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  const labels = (await page.locator('button[role="gridcell"]:not([aria-disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")))) as string[];
  const target = labels.find((d) => {
    const off = diffDays(today, d);
    return off >= opts.minOffsetDays && (opts.maxOffsetDays === undefined || off <= opts.maxOffsetDays) && d !== opts.not;
  });
  assert(target, `no bookable date with offset >= ${opts.minOffsetDays} (enabled: ${labels.join(",")})`);
  await page.locator(`button[role="gridcell"][data-date="${target}"]`).click();
  return target;
}
function slotChips(page: Page) {
  return page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ });
}
/** waits for slots and clicks the chip at index (or with the given HH:MM label). returns HH:MM */
async function pickSlot(page: Page, which: number | string = 0): Promise<string> {
  await page.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  const enabled = slotChips(page).locator(":scope:not([disabled])");
  await enabled.first().waitFor({ timeout: 30_000 });
  const chip = typeof which === "number" ? enabled.nth(which) : enabled.filter({ hasText: which }).first();
  const label = (await chip.innerText()).trim().slice(0, 5);
  await chip.click();
  return label;
}
async function fillDetails(page: Page, d: { name?: string; phone?: string; email?: string; note?: string }) {
  if (d.name !== undefined) await page.fill("#bk-name", d.name);
  if (d.phone !== undefined) await page.fill("#bk-phone", d.phone);
  if (d.email !== undefined) await page.fill("#bk-email", d.email);
  if (d.note !== undefined) await page.fill("#bk-note", d.note);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByText("ตรวจสอบและยืนยันการจอง").waitFor();
}
async function confirmBooking(page: Page): Promise<{ id: string; key: string; url: string }> {
  await page.getByRole("button", { name: "ยืนยันการจอง" }).click();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}\?k=/, { timeout: 60_000 });
  const u = new URL(page.url());
  const id = u.pathname.match(UUID_RE)![0];
  const key = u.searchParams.get("k")!;
  await page.getByText("หมายเลขการจอง").waitFor();
  return { id, key, url: page.url() };
}
async function bodyText(page: Page) {
  return page.evaluate(() => document.body.innerText);
}
async function uploadSlipAndWaitPaid(page: Page) {
  await page.getByText("แนบสลิปโอนเงิน").waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("ชำระเงินสำเร็จ").waitFor({ timeout: 30_000 });
}
/** same-origin fetch from inside the page (Node cannot resolve *.localhost; this also carries the customer cookie) */
async function fetchInPage(page: Page, url: string): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { cache: "no-store", redirect: "manual" });
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => (headers[k] = v));
    return { status: r.status, headers, text: await r.text() };
  }, url);
}
/** cross-origin GET via a scratch tab (status + body of any tenant host) */
async function gotoGet(ctx: BrowserContext, url: string): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  const p = await ctx.newPage();
  try {
    const r = await p.goto(url, { waitUntil: "commit" });
    assert(r, `no response for ${url}`);
    return { status: r.status(), headers: r.headers(), text: await r.text() };
  } finally {
    await p.close();
  }
}
const alertBox = (page: Page) => page.locator('p[role="alert"]');
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
async function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44 || r.width < 44) out.push(`${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, selector);
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const today = bkkToday();
  console.log(`BKK today ${today}, now ${Math.floor(bkkNowMinutes() / 60)}:${String(bkkNowMinutes() % 60).padStart(2, "0")}`);

  /* ============================== demo-salon (desktop) ============================== */
  const salon = origin("demo-salon");
  const { page: s } = await newPage(browser, "salon-desktop");
  let lastSlotsUrl = "";
  s.on("request", (r) => {
    if (r.url().includes("/api/booking/slots")) lastSlotsUrl = r.url();
  });

  await step("S1a", "salon /services lists services", s, async () => {
    const res = await s.goto(`${salon}/services`);
    assert(res?.status() === 200, `status ${res?.status()}`);
    await s.getByRole("heading", { level: 1, name: "บริการทั้งหมด" }).waitFor();
    const cards = await s.locator('a[href^="/services/"]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute("href"))).size);
    assert(cards >= 8, `expected >= 8 service links, got ${cards}`);
    const txt = await bodyText(s);
    assert(/8 รายการ/.test(txt), "count copy '8 รายการ' missing");
    assert(/มัดจำ/.test(txt), "deposit badge missing on aroma/hot-stone cards");
    return `${cards} services, overflow=${await overflow(s)}px`;
  });

  await step("S1b", "salon /services/[slug] detail + category filter", s, async () => {
    const res = await s.goto(`${salon}/services/aroma-90`);
    assert(res?.status() === 200, `status ${res?.status()}`);
    await s.getByRole("heading", { level: 1, name: /อโรมาเทอราพี 90 นาที/ }).waitFor();
    const txt = await bodyText(s);
    assert(/ชำระมัดจำ ฿300/.test(txt), "deposit note ฿300 missing");
    assert(/ให้บริการโดย/.test(txt), "performedBy section missing");
    const r2 = await s.goto(`${salon}/services?category=skin`);
    assert(r2?.status() === 200, `category status ${r2?.status()}`);
    await s.getByRole("heading", { level: 1, name: "ผิวพรรณ" }).waitFor();
    const n = await s.locator('a[href^="/book?service="]').count();
    assert(n === 2, `skin category should show 2 services (facial, scrub), got ${n}`);
  });

  await step("S1c", "salon /staff lists therapists", s, async () => {
    const res = await s.goto(`${salon}/staff`);
    assert(res?.status() === 200, `status ${res?.status()}`);
    await s.getByRole("heading", { level: 1, name: "ทีมของเรา" }).waitFor();
    const txt = await bodyText(s);
    assert(/4 ท่าน/.test(txt), "count copy '4 ท่าน' missing");
    for (const n of ["พี่แอน", "พี่มะลิ", "พี่น้ำ", "พี่โบว์"]) assert(txt.includes(n), `${n} missing`);
    const book = await s.locator('a[href^="/book?staff="]').count();
    assert(book >= 4, `expected 4 'จองกับ' buttons, got ${book}`);
    const r2 = await s.goto(`${salon}/staff/mali`);
    assert(r2?.status() === 200, `profile status ${r2?.status()}`);
    await s.getByRole("heading", { level: 1, name: "พี่มะลิ" }).waitFor();
    assert(/บริการที่ดูแล/.test(await bodyText(s)), "staffServices heading missing");
  });

  /* ---- S2: no-deposit booking with ใครก็ได้ที่ว่าง ---- */
  let anyBooking: { id: string; key: string; url: string; date: string; time: string } | null = null;
  await step("S2", "salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed", s, async () => {
    await s.goto(`${salon}/book`);
    await s.getByRole("heading", { level: 1, name: "จองคิวออนไลน์" }).waitFor();
    await pickService(s, "นวดไทยโบราณ 60 นาที");
    await s.getByText("เลือกผู้ให้บริการ").waitFor();
    await pickStaff(s, "any");
    await s.getByText("เลือกวันที่สะดวก").waitFor();
    const date = await pickDate(s, { minOffsetDays: 2 });
    await s.getByText("เลือกเวลา").waitFor();
    const time = await pickSlot(s, 1);
    assert(/\/api\/booking\/slots\?date=/.test(lastSlotsUrl), "slot chips did not come from /api/booking/slots");
    await s.getByText("ข้อมูลสำหรับติดต่อ").waitFor();
    await fillDetails(s, { name: "คิวเอ สบายสบาย", phone: "0891234567", note: "ทดสอบระบบ QA" });
    const txt = await bodyText(s);
    assert(txt.includes("ไม่ต้องมัดจำ ยืนยันทันที"), "noDeposit badge missing on confirm step");
    assert(txt.includes("ใครก็ได้ที่ว่าง"), "staff summary should say ใครก็ได้ที่ว่าง");
    const b = await confirmBooking(s);
    const t2 = await bodyText(s);
    assert(/BK-\d{4}/.test(t2), "booking number BK-xxxx missing");
    assert(t2.includes("ยืนยันแล้ว"), "status should be ยืนยันแล้ว");
    assert(t2.includes("จองสำเร็จ"), "success headline missing");
    assert(!t2.includes("ยอดที่ต้องชำระ"), "no PaymentPanel expected for no-deposit booking");
    assert(/พี่(แอน|มะลิ|น้ำ|โบว์)/.test(t2), "assigned staff name missing (ใครก็ได้ should pick someone)");
    assert(t2.includes(time), `slot time ${time} not shown on booking page`);
    anyBooking = { ...b, date, time };
    return `${t2.match(/BK-\d{4}/)?.[0]} ${date} ${time} → ${b.url.replace(salon, "")}`;
  });

  await step("S2x", "booking page is private: no key / wrong key / ics without key", null, async () => {
    assert(anyBooking, "needs S2");
    const { ctx: c2, page: p2 } = await newPage(browser, "salon-anon");
    try {
      await p2.goto(`${salon}/bookings/${anyBooking.id}`);
      assert((await bodyText(p2)).includes("ไม่สามารถเปิดการจองนี้ได้"), "no-key view should be blocked");
      await p2.goto(`${salon}/bookings/${anyBooking.id}?k=wrongkey`);
      assert((await bodyText(p2)).includes("ไม่สามารถเปิดการจองนี้ได้"), "wrong-key view should be blocked");
      const r = await fetchInPage(p2, `/bookings/${anyBooking.id}/ics`);
      assert(r.status === 404, `ics without key should be 404, got ${r.status}`);
      const r2 = await fetchInPage(p2, `/bookings/${anyBooking.id}/ics?k=wrong`);
      assert(r2.status === 404, `ics with wrong key should be 404, got ${r2.status}`);
    } finally {
      await c2.close();
    }
  });

  await step("S7a", "salon .ics download with key", s, async () => {
    assert(anyBooking, "needs S2");
    const r = await fetchInPage(s, `/bookings/${anyBooking.id}/ics?k=${encodeURIComponent(anyBooking.key)}`);
    assert(r.status === 200, `status ${r.status}`);
    const ct = r.headers["content-type"] ?? "";
    assert(ct.startsWith("text/calendar"), `content-type ${ct}`);
    const cd = r.headers["content-disposition"] ?? "";
    assert(/attachment; filename="BK-\d+\.ics"/.test(cd), `content-disposition ${cd}`);
    const body = r.text.replace(/\r\n[ \t]/g, "");
    for (const k of ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART:", "DTEND:", "STATUS:CONFIRMED", "SUMMARY:นวดไทยโบราณ 60 นาที", "BEGIN:VALARM", "END:VCALENDAR"]) assert(body.includes(k), `ics missing ${k}`);
    assert(/^UID:.+@demo-salon\.localhost/m.test(body), "UID host missing");
    return `${body.length} bytes`;
  });

  /* ---- S4: double booking (same named staff + slot) ---- */
  await step("S4", "double booking same staff+slot via server action → slot_taken", s, async () => {
    const { ctx: cB, page: b } = await newPage(browser, "salon-B");
    try {
      let slotsUrlA = "";
      s.on("request", (r) => {
        if (r.url().includes("/api/booking/slots")) slotsUrlA = r.url();
      });
      // A
      await s.goto(`${salon}/book?service=thai-60&staff=mali`);
      await s.getByText("เลือกวันที่สะดวก").waitFor();
      const date = await pickDate(s, { minOffsetDays: 2, not: anyBooking?.date ?? null });
      const time = await pickSlot(s, 2);
      await fillDetails(s, { name: "ลูกค้า A", phone: "0811111111" });
      // B – same route, same date, same chip
      await b.goto(`${salon}/book?service=thai-60&staff=mali`);
      await b.getByText("เลือกวันที่สะดวก").waitFor();
      await b.locator(`button[role="gridcell"]:not(.animate-pulse)`).first().waitFor();
      await b.locator(`button[role="gridcell"][data-date="${date}"]`).click();
      const timeB = await pickSlot(b, time);
      assert(timeB === time, `B picked ${timeB} != ${time}`);
      await fillDetails(b, { name: "ลูกค้า B", phone: "0822222222" });
      // A confirms first
      const bookedA = await confirmBooking(s);
      const u0 = new URL(slotsUrlA);
      (globalThis as any).__salonIds = { service: u0.searchParams.get("service"), staff: u0.searchParams.get("staff"), date, bookedA };
      assert((await bodyText(s)).includes("พี่มะลิ"), "A should be booked with พี่มะลิ");
      // B confirms → must be rejected (note: Next's <next-route-announcer> also has role=alert, so target the wizard's <p role=alert>)
      await b.getByRole("button", { name: "ยืนยันการจอง" }).click();
      await Promise.race([alertBox(b).first().waitFor({ timeout: 30_000 }), b.waitForURL(/\/bookings\//, { timeout: 30_000 })]).catch(() => {});
      if (/\/bookings\//.test(b.url())) throw new Error(`DOUBLE BOOKING: B landed on ${b.url()} (${(await bodyText(b)).match(/BK-\d+/)?.[0]})`);
      const msg = (await alertBox(b).allInnerTexts()).join(" | ");
      assert(msg.includes("เวลานี้เพิ่งถูกจองไป"), `expected slot_taken message, got: ${msg}`);
      // wizard should bounce back to the time step with the chip now disabled
      await b.getByText("เลือกเวลา").waitFor();
      await b.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
      const chipB = slotChips(b).filter({ hasText: time }).first();
      await chipB.waitFor();
      assert(await chipB.isDisabled(), `chip ${time} should be disabled after refetch`);
      // API agrees
      const api = await fetchInPage(s, `/api/booking/slots?date=${date}&service=${u0.searchParams.get("service")}&staff=${u0.searchParams.get("staff")}`);
      assert(api.status === 200, `slots api ${api.status}`);
      const j = JSON.parse(api.text) as { slots: Array<{ start: string; available: boolean; remaining: number }> };
      const taken = j.slots.find((x) => new Date(x.start).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24/, "00") === time);
      assert(taken, `slot ${time} not in api response`);
      assert(taken.available === false && taken.remaining === 0, `api still shows slot available: ${JSON.stringify(taken)}`);
      return `${date} ${time} A=${bookedA.id.slice(0, 8)} B rejected`;
    } finally {
      await cB.close();
    }
  });

  await step("S4b", "/api/booking/slots + /days validation and cross-tenant isolation", null, async () => {
    const ids = (globalThis as any).__salonIds as { service: string; staff: string; date: string } | undefined;
    assert(ids, "needs S4");
    const bad = await fetchInPage(s, `/api/booking/slots?date=2026-13-99&service=${ids.service}`);
    assert(bad.status === 400, `bad date should be 400, got ${bad.status}`);
    const bad2 = await fetchInPage(s, `/api/booking/days?month=2026-10&service=not-a-uuid`);
    assert(bad2.status === 400, `bad service should be 400, got ${bad2.status}`);
    const days = await fetchInPage(s, `/api/booking/days?month=${ids.date.slice(0, 7)}&service=${ids.service}`);
    assert(days.status === 200, `days ${days.status}`);
    const dj = JSON.parse(days.text) as { days: Array<{ date: string; available: boolean; count: number }> };
    assert(dj.days.length >= 28 && dj.days.some((d) => d.available), "days payload empty");
    const past = dj.days.filter((d) => d.date < today);
    assert(past.every((d) => !d.available), "past days must not be available");
    // another tenant must not see salon's service
    const cross = await gotoGet(s.context(), `${origin("demo-clinic")}/api/booking/slots?date=${ids.date}&service=${ids.service}&staff=${ids.staff}`);
    assert(cross.status === 404, `clinic host with salon service id should be 404, got ${cross.status}`);
    const cross2 = await gotoGet(s.context(), `${origin("demo-shop")}/api/booking/slots?date=${ids.date}&service=${ids.service}`);
    assert(cross2.status === 404, `shop (no booking module) should be 404, got ${cross2.status}`);
    const cc = days.headers["cache-control"] ?? "";
    assert(/no-store/.test(cc), `cache-control should be no-store, got ${cc}`);
    return `days=${dj.days.length}, cross-tenant 404 ok`;
  });

  /* ---- S5: reschedule + cancel ---- */
  let rescheduled: { id: string; key: string } | null = null;
  await step("S5a", "reschedule from booking page (policy allows) → new booking, old cancelled", s, async () => {
    assert(anyBooking, "needs S2");
    await s.goto(anyBooking.url);
    await s.getByText("หมายเลขการจอง").waitFor();
    const txt = await bodyText(s);
    assert(txt.includes("นโยบายการยกเลิก / เลื่อนนัด"), "policy card missing");
    assert(txt.includes("ก่อนเวลานัดอย่างน้อย 12 ชั่วโมง"), "salon policy should say 12 ชั่วโมง");
    await s.getByRole("button", { name: "เลื่อนนัด" }).click();
    await s.getByText("เลือกวันและเวลาใหม่").waitFor();
    const newDate = await pickDate(s, { minOffsetDays: 2, not: anyBooking.date });
    const newTime = await pickSlot(s, 0);
    await s.getByRole("button", { name: /ยืนยันเลื่อนเป็น/ }).click();
    await s.waitForURL((u) => /\/bookings\/[0-9a-f-]{36}\?k=/.test(u.href) && !u.href.includes(anyBooking!.id), { timeout: 60_000 });
    await s.getByText("หมายเลขการจอง").waitFor();
    const t2 = await bodyText(s);
    assert(t2.includes("ยืนยันแล้ว"), "rescheduled booking should be confirmed");
    assert(t2.includes("เลื่อนมาจากการจองก่อนหน้า"), "rescheduledFrom note missing");
    assert(t2.includes(newTime), `new time ${newTime} missing`);
    const u = new URL(s.url());
    rescheduled = { id: u.pathname.match(UUID_RE)![0], key: u.searchParams.get("k")! };
    // old one is cancelled
    await s.goto(anyBooking.url);
    const t3 = await bodyText(s);
    assert(t3.includes("ยกเลิกแล้ว"), "old booking should show ยกเลิกแล้ว");
    assert(!t3.includes("เลื่อนนัด") || !(await s.getByRole("button", { name: "เลื่อนนัด" }).isVisible().catch(() => false)), "old booking must not offer reschedule");
    return `${anyBooking.date} ${anyBooking.time} → ${newDate} ${newTime}`;
  });

  await step("S5b", "cancel from booking page (policy allows)", s, async () => {
    assert(rescheduled, "needs S5a");
    await s.goto(`${salon}/bookings/${rescheduled.id}?k=${encodeURIComponent(rescheduled.key)}`);
    await s.getByRole("button", { name: "ยกเลิกการจอง" }).click();
    await s.fill("#cancel-reason", "ติดธุระ (ทดสอบ QA)");
    await s.getByRole("button", { name: "ยืนยันยกเลิกการจอง" }).click();
    await s.waitForFunction(() => document.body.innerText.includes("ยกเลิกแล้ว"), null, { timeout: 60_000 });
    const t = await bodyText(s);
    assert(t.includes("การจองนี้ถูกยกเลิกแล้ว"), "cancelled headline missing");
    assert(t.includes("ติดธุระ (ทดสอบ QA)"), "cancel reason not shown");
    assert(t.includes("จองใหม่อีกครั้ง"), "rebook CTA missing");
    assert(!(await s.getByRole("button", { name: "เลื่อนนัด" }).isVisible().catch(() => false)), "actions must disappear after cancel");
    const ics = await fetchInPage(s, `/bookings/${rescheduled.id}/ics?k=${encodeURIComponent(rescheduled.key)}`);
    assert(ics.text.includes("STATUS:CANCELLED"), "ics of cancelled booking should be STATUS:CANCELLED");
  });

  await step("S5c", "policy: booking inside cancelHours shows too_late and hides actions", s, async () => {
    await s.goto(`${salon}/book?service=foot-60`);
    await s.getByText("เลือกผู้ให้บริการ").waitFor();
    await pickStaff(s, "any");
    const labels = (await (async () => {
      await s.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)').first().waitFor();
      return s.locator('button[role="gridcell"]:not([aria-disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")));
    })()) as string[];
    if (!labels.includes(today)) return `SKIP – no slots today (${today}) at ${Math.floor(bkkNowMinutes() / 60)}:xx`;
    await s.locator(`button[role="gridcell"][data-date="${today}"]`).click();
    const time = await pickSlot(s, 0);
    const [hh, mm] = time.split(":").map(Number) as [number, number];
    const hoursAhead = (hh * 60 + mm - bkkNowMinutes()) / 60;
    assert(hoursAhead >= 1, `min notice violated: first slot ${time} is only ${hoursAhead.toFixed(2)}h ahead (minNoticeHours=1)`);
    await fillDetails(s, { name: "คิวเอ วันนี้", phone: "0833333333" });
    await confirmBooking(s);
    const t = await bodyText(s);
    const expectTooLate = hoursAhead < 12;
    if (expectTooLate) {
      assert(t.includes("เกินกำหนดเวลาที่สามารถยกเลิก/เลื่อนนัดได้"), "too_late notice missing for booking inside 12h");
      assert(!(await s.getByRole("button", { name: "เลื่อนนัด" }).isVisible().catch(() => false)), "reschedule must be hidden inside cancelHours");
    } else {
      assert(await s.getByRole("button", { name: "เลื่อนนัด" }).isVisible(), "reschedule should be offered (>12h ahead)");
    }
    return `today ${time} (${hoursAhead.toFixed(1)}h ahead) → ${expectTooLate ? "too_late shown" : "actions shown"}`;
  });

  /* ---- S3: deposit booking + slip ---- */
  let depositBooking: { id: string; key: string; url: string } | null = null;
  await step("S3","salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid", s, async () => {
    await s.goto(`${salon}/book?service=aroma-90`);
    await s.getByText("เลือกผู้ให้บริการ").waitFor();
    await pickStaff(s, "พี่น้ำ");
    await pickDate(s, { minOffsetDays: 2 });
    const time = await pickSlot(s, 0);
    await fillDetails(s, { name: "คิวเอ มัดจำ", phone: "0844444444", email: "qa-deposit@example.com" });
    const t0 = await bodyText(s);
    assert(t0.includes("ชำระตอนนี้ (มัดจำ)") && t0.includes("฿300"), "confirm step should show deposit ฿300 due now");
    assert(t0.includes("วิธีชำระมัดจำ"), "payment method picker missing");
    assert(t0.includes("สแกน PromptPay") && t0.includes("โอนเงินผ่านธนาคาร"), "expected promptpay + bank transfer methods");
    const b = await confirmBooking(s);
    const t1 = await bodyText(s);
    assert(t1.includes("รอชำระมัดจำ"), "status should be รอชำระมัดจำ before payment");
    assert(t1.includes("ยอดที่ต้องชำระ") && t1.includes("฿300"), "PaymentPanel with ฿300 missing");
    assert(await s.locator('img[alt="PromptPay QR"]').isVisible(), "PromptPay QR image missing");
    assert(t1.includes("ยังไม่ชำระ"), "payment status should be ยังไม่ชำระ");
    await uploadSlipAndWaitPaid(s);
    depositBooking = b;
    return `${b.id.slice(0, 8)} ${time}: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ`;
  });

  await step("S3b", "salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid", s, async () => {
    assert(depositBooking, "needs S3");
    const ok = await s
      .waitForFunction(() => document.body.innerText.includes("ชำระมัดจำแล้ว"), null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) await s.goto(depositBooking.url);
    const t2 = await bodyText(s);
    const stuck = !t2.includes("ชำระมัดจำแล้ว");
    assert(!stuck, `payment is paid (panel showed ชำระเงินสำเร็จ) but booking still '${t2.match(/รอชำระมัดจำ|ยืนยันแล้ว/)?.[0]}' / '${t2.match(/ยังไม่ชำระ|ชำระมัดจำแล้ว/)?.[0]}'; PaymentPanel visible=${t2.includes("ยอดที่ต้องชำระ")} → customer stuck with no way to retry`);
    assert(t2.includes("ยืนยันแล้ว"), "status should be ยืนยันแล้ว after deposit");
    assert(t2.includes("ชำระที่ร้าน") && t2.includes("฿990"), "remaining ฿990 pay-at-shop missing");
    assert(!t2.includes("ยอดที่ต้องชำระ"), "PaymentPanel should be gone after payment");
    assert(t2.includes("ยืนยันเมื่อ"), "confirmedAt row missing");
  });

  await step("S6", "group service (couple, capacity 2): staff step skipped, 'เหลือ n ที่' chips, seats decrement, full slot blocked", s, async () => {
    await s.goto(`${salon}/book?service=couple`);
    await s.getByText("เลือกวันที่สะดวก").waitFor();
    assert(!(await bodyText(s)).includes("เลือกผู้ให้บริการ"), "staff step should be skipped for a capacity service");
    const date = await pickDate(s, { minOffsetDays: 3 });
    await s.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
    const chip = slotChips(s).locator(":scope:not([disabled])").nth(4);
    const label0 = await chip.innerText();
    assert(/เหลือ 2 ที่/.test(label0), `expected 'เหลือ 2 ที่' on chip, got '${label0.replace(/\n/g, " ")}'`);
    const time = label0.trim().slice(0, 5);
    await chip.click();
    await fillDetails(s, { name: "คู่รัก หนึ่ง", phone: "0855555551" });
    assert((await bodyText(s)).includes("฿500"), "couple deposit ฿500 missing");
    const b1 = await confirmBooking(s);
    assert((await bodyText(s)).includes("รอชำระมัดจำ"), "first couple booking pending deposit");
    // second (unrelated) customer, same slot
    await s.goto(`${salon}/book?service=couple`);
    await s.locator('button[role="gridcell"]:not(.animate-pulse)').first().waitFor();
    await s.locator(`button[role="gridcell"][data-date="${date}"]`).click();
    await s.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
    const chip2 = slotChips(s).filter({ hasText: time }).first();
    const label1 = await chip2.innerText();
    assert(/เหลือ 1 ที่/.test(label1), `expected 'เหลือ 1 ที่' after first booking, got '${label1.replace(/\n/g, " ")}'`);
    await chip2.click();
    await fillDetails(s, { name: "คู่รัก สอง", phone: "0855555552" });
    const b2 = await confirmBooking(s);
    // third: slot must be full
    await s.goto(`${salon}/book?service=couple`);
    await s.locator('button[role="gridcell"]:not(.animate-pulse)').first().waitFor();
    await s.locator(`button[role="gridcell"][data-date="${date}"]`).click();
    await s.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
    const chip3 = slotChips(s).filter({ hasText: time }).first();
    await chip3.waitFor();
    assert(await chip3.isDisabled(), `chip ${time} should be disabled when capacity is exhausted`);
    return `${date} ${time}: ${b1.id.slice(0, 8)} + ${b2.id.slice(0, 8)} (two unrelated customers share the couple room – see finding)`;
  });

  /* ============================== demo-clinic (mobile 390) ============================== */
  const clinic = origin("demo-clinic");
  const { page: c } = await newPage(browser, "clinic-mobile", MOBILE);
  const PHONE = "0899001122";

  await step("C1", "clinic /services + /staff (mobile)", c, async () => {
    const r = await c.goto(`${clinic}/services`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await c.getByRole("heading", { level: 1, name: "บริการทั้งหมด" }).waitFor();
    const txt = await bodyText(c);
    assert(/8 รายการ/.test(txt), "'8 รายการ' missing");
    assert(txt.includes("ฟรี"), "free consult should show ฟรี");
    assert(txt.includes("เริ่มต้น"), "priceNote เริ่มต้น missing");
    const ov1 = await overflow(c);
    const r2 = await c.goto(`${clinic}/staff`);
    assert(r2?.status() === 200, `staff status ${r2?.status()}`);
    const t2 = await bodyText(c);
    for (const n of ["พญ.ณิชา วรรณกุล", "นพ.กันต์ ศิริวัฒน์", "ทพญ.พิมพ์ชนก ตั้งใจ"]) assert(t2.includes(n), `${n} missing`);
    assert(/3 ท่าน/.test(t2), "'3 ท่าน' missing");
    const ov2 = await overflow(c);
    assert(ov1 <= 0 && ov2 <= 0, `horizontal overflow services=${ov1}px staff=${ov2}px`);
    const small = await smallTargets(c, 'a[href^="/book?staff="], a[href^="/staff/"]:not([aria-label])');
    return `overflow ok; small targets: ${small.length ? small.join("; ") : "none"}`;
  });

  let buyHref = "";
  await step("C6a", "clinic /packages lists packages; buy requires login", c, async () => {
    const r = await c.goto(`${clinic}/packages`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await c.getByRole("heading", { level: 1, name: "คอร์สและแพ็กเกจ" }).waitFor();
    const hrefs = (await c.locator('a[href^="/packages/"][href$="/buy"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")))])) as string[];
    assert(hrefs.length >= 3, `expected >= 3 packages, got ${hrefs.length}`);
    const txt = await bodyText(c);
    assert(txt.includes("คอร์ส Pico หน้าใส 5 ครั้ง") && txt.includes("ประหยัด"), "package card copy missing");
    buyHref = hrefs.find((h) => h) ?? "";
    await c.goto(`${clinic}${buyHref}`);
    await c.waitForURL(/\/account\/login\?next=/, { timeout: 60_000 });
    const next = new URL(c.url()).searchParams.get("next");
    assert(next === buyHref, `next should be ${buyHref}, got ${next}`);
    return `${hrefs.length} packages, redirected to login`;
  });

  await step("C6b", "OTP login (dev code shown inline) → back to buy page", c, async () => {
    await c.fill("#otp-target", PHONE);
    await c.locator('form button[type="submit"]').click();
    await c.locator("#otp-code").waitFor({ timeout: 60_000 });
    const txt = await bodyText(c);
    const code = txt.match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    assert(code, `dev OTP code not shown inline. page text: ${txt.slice(0, 200)}`);
    await c.fill("#otp-code", code);
    await c.fill("#otp-name", "คิวเอ ทดสอบ");
    await c.locator('form button[type="submit"]').click();
    await c.waitForURL((u) => u.pathname.endsWith("/buy"), { timeout: 60_000 });
    await c.getByText("ยอดชำระ").waitFor();
    assert((await bodyText(c)).includes("ซื้อในชื่อ"), "buyer summary missing");
    return `logged in as ${PHONE}`;
  });

  let ppUrl = "";
  await step("C6c", "buy package → payment → slip → package active", c, async () => {
    await c.locator('input[name="consent"]').check();
    await c.locator('form button[type="submit"]', { hasText: "ซื้อแพ็กเกจ" }).click();
    await c.waitForURL(/\/account\/packages\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    ppUrl = c.url();
    const t1 = await bodyText(c);
    assert(t1.includes("รอชำระเงิน"), "status should be รอชำระเงิน");
    assert(t1.includes("ยอดที่ต้องชำระ"), "PaymentPanel missing");
    await uploadSlipAndWaitPaid(c);
    return `${ppUrl.replace(clinic, "")}: slip uploaded, panel says ชำระเงินสำเร็จ`;
  });

  await step("C6c2", "clinic: patient package flips to ใช้งานได้ after payment", c, async () => {
    assert(ppUrl, "needs C6c");
    const ok = await c
      .waitForFunction(() => document.body.innerText.includes("ใช้งานได้"), null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) await c.goto(ppUrl);
    const t2 = await bodyText(c);
    assert(t2.includes("ใช้งานได้"), `payment paid but package still '${t2.match(/รอชำระเงิน|ใช้งานได้/)?.[0]}'; PaymentPanel visible=${t2.includes("ยอดที่ต้องชำระ")} → customer stuck`);
    assert(t2.includes("คอร์สพร้อมใช้งาน"), "active headline missing");
    assert(/ครั้งคงเหลือ/.test(t2), "sessions left missing");
    assert(t2.includes("ใช้ได้ถึง"), "expiry missing");
    assert(t2.includes("จองคิวใช้สิทธิ์"), "book CTA missing");
    const r2 = await c.goto(`${clinic}/packages`);
    assert(r2?.ok(), "packages reload");
    assert(/คอร์สของฉัน · เหลือ \d+ ครั้ง/.test(await bodyText(c)), "/packages header should show sessions left for logged-in customer");
  });

  await step("C6e", "/account/packages lists the purchased package (mobile)", c, async () => {
    const r = await c.goto(`${clinic}/account/packages`);
    assert(r?.status() === 200, `account/packages ${r?.status()}`);
    await c.getByRole("heading", { level: 1, name: "คอร์สของฉัน" }).waitFor();
    const t3 = await bodyText(c);
    assert(t3.includes("คอร์ส Pico หน้าใส 5 ครั้ง"), "purchased package missing from list");
    assert((await overflow(c)) <= 0, `overflow ${await overflow(c)}px`);
    return t3.match(/ใช้งานได้ \d+ คอร์ส · เหลือรวม \d+ ครั้ง/)?.[0] ?? "";
  });

  let consultBooking: { id: string; key: string } | null = null;
  await step("C2", "clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile)", c, async () => {
    await c.goto(`${clinic}/book`);
    await c.getByRole("heading", { level: 1, name: "จองคิวออนไลน์" }).waitFor();
    assert((await overflow(c)) <= 0, `overflow ${await overflow(c)}px on /book`);
    await pickService(c, "ปรึกษาแพทย์ + วิเคราะห์ผิว");
    await c.getByText("เลือกผู้ให้บริการ").waitFor();
    const staffNames = await bodyText(c);
    assert(staffNames.includes("พญ.ณิชา วรรณกุล") && staffNames.includes("นพ.กันต์ ศิริวัฒน์") && !staffNames.includes("ทพญ.พิมพ์ชนก"), "consult should list only dr-nicha + dr-kan");
    await pickStaff(c, "นพ.กันต์ ศิริวัฒน์");
    const date = await pickDate(c, { minOffsetDays: 2 });
    const smallCells = await smallTargets(c, 'button[role="gridcell"]');
    const time = await pickSlot(c, 0);
    const smallChips = await smallTargets(c, "button[aria-pressed]");
    await c.getByText("ข้อมูลสำหรับติดต่อ").waitFor();
    const name = await c.inputValue("#bk-name");
    const phone = await c.inputValue("#bk-phone");
    assert(name === "คิวเอ ทดสอบ", `name should be prefilled, got '${name}'`);
    assert(phone.replace(/\D/g, "").endsWith("99001122"), `phone should be prefilled, got '${phone}'`);
    await fillDetails(c, {});
    const t0 = await bodyText(c);
    assert(t0.includes("ฟรี"), "confirm step should show ฟรี");
    assert(t0.includes("ไม่ต้องมัดจำ ยืนยันทันที"), "noDeposit badge missing");
    assert(t0.includes("อย่างน้อย 24 ชั่วโมง"), "clinic policy should say 24 ชั่วโมง");
    const b = await confirmBooking(c);
    consultBooking = b;
    const t = await bodyText(c);
    assert(t.includes("ยืนยันแล้ว") && t.includes("นพ.กันต์ ศิริวัฒน์"), "confirmed with chosen doctor");
    assert(t.includes("ฟรี"), "price ฟรี missing on booking page");
    assert((await overflow(c)) <= 0, `overflow on booking page ${await overflow(c)}px`);
    return `${date} ${time}; small gridcells: ${smallCells.length}; small chips: ${smallChips.length}${smallChips.length ? ` (${smallChips.slice(0, 3).join("; ")})` : ""}`;
  });

  let botoxBooking: { id: string; key: string; url: string } | null = null;
  await step("C3", "clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile)", c, async () => {
    await c.goto(`${clinic}/book?service=botox`);
    await c.getByText("เลือกผู้ให้บริการ").waitFor();
    await pickStaff(c, "any");
    await pickDate(c, { minOffsetDays: 2 });
    const time = await pickSlot(c, 1);
    await fillDetails(c, {});
    const t0 = await bodyText(c);
    assert(t0.includes("฿500") && t0.includes("ชำระตอนนี้"), "deposit ฿500 missing on confirm");
    const b = await confirmBooking(c);
    const t1 = await bodyText(c);
    assert(t1.includes("รอชำระมัดจำ") && t1.includes("ยอดที่ต้องชำระ"), "pending + PaymentPanel expected");
    assert((await overflow(c)) <= 0, `overflow on payment page ${await overflow(c)}px`);
    assert(t1.includes("พญ.ณิชา วรรณกุล"), "botox 'any' should assign dr-nicha (only eligible doctor)");
    await uploadSlipAndWaitPaid(c);
    botoxBooking = b;
    return `${b.id.slice(0, 8)} ${time}: slip uploaded, panel says ชำระเงินสำเร็จ`;
  });

  await step("C3b", "clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile)", c, async () => {
    assert(botoxBooking, "needs C3");
    const ok = await c
      .waitForFunction(() => document.body.innerText.includes("ชำระมัดจำแล้ว"), null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) await c.goto(botoxBooking.url);
    const t2 = await bodyText(c);
    assert(t2.includes("ชำระมัดจำแล้ว"), `payment paid but booking still '${t2.match(/รอชำระมัดจำ|ยืนยันแล้ว/)?.[0]}' / '${t2.match(/ยังไม่ชำระ|ชำระมัดจำแล้ว/)?.[0]}'; PaymentPanel visible=${t2.includes("ยอดที่ต้องชำระ")}`);
    assert(t2.includes("ยืนยันแล้ว"), "should be confirmed after deposit");
    assert(t2.includes("฿4,400"), "remaining ฿4,400 (4,900 − 500) missing");
  });

  await step("C6d", "/account/bookings lists the logged-in customer's bookings", c, async () => {
    assert(consultBooking, "needs C2");
    const r = await c.goto(`${clinic}/account/bookings`);
    assert(r?.status() === 200, `status ${r?.status()}`);
    await c.getByRole("heading", { level: 1, name: "การจองของฉัน" }).waitFor();
    const t = await bodyText(c);
    const n = Number(t.match(/นัดถัดไป \((\d+)\)/)?.[1] ?? 0);
    assert(n >= 2, `expected >= 2 upcoming bookings, got ${n}`);
    assert(t.includes("ปรึกษาแพทย์ + วิเคราะห์ผิว") && t.includes("Botox"), "both bookings should be listed");
    const links = await c.locator(`a[href="/bookings/${consultBooking.id}"]`).count();
    assert(links === 1, "consult booking row link missing");
    assert((await overflow(c)) <= 0, `overflow ${await overflow(c)}px`);
    // owner can open without key
    await c.goto(`${clinic}/bookings/${consultBooking.id}`);
    assert((await bodyText(c)).includes("หมายเลขการจอง"), "owner should open booking without key");
    const past = await c.goto(`${clinic}/account/bookings?scope=past`);
    assert(past?.ok(), "past tab");
    return `${n} upcoming`;
  });

  await step("C7", "clinic .ics as owner (no key)", c, async () => {
    assert(consultBooking, "needs C2");
    const r = await fetchInPage(c, `/bookings/${consultBooking.id}/ics`);
    assert(r.status === 200, `status ${r.status}`);
    const body = r.text.replace(/\r\n[ \t]/g, "");
    assert(body.includes("SUMMARY:ปรึกษาแพทย์ + วิเคราะห์ผิว – Lumière Clinic") || body.includes("SUMMARY:ปรึกษาแพทย์ + วิเคราะห์ผิว"), "summary missing");
    assert(body.includes("LOCATION:ชั้น 3 เอ็มควอเทียร์"), "location missing");
    assert(body.includes("STATUS:CONFIRMED"), "status missing");
    const lines = r.text.split("\r\n");
    const tooLong = lines.filter((l) => Buffer.byteLength(l, "utf8") > 75);
    assert(tooLong.length === 0, `${tooLong.length} lines exceed 75 octets (RFC 5545 folding)`);
  });

  await step("C8", "tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking", c, async () => {
    const ids = (globalThis as any).__salonIds as { bookedA: { id: string; key: string } } | undefined;
    assert(ids, "needs S4");
    const r = await c.goto(`${clinic}/bookings/${ids.bookedA.id}?k=${encodeURIComponent(ids.bookedA.key)}`);
    assert(r?.status() === 200 || r?.status() === 404, `status ${r?.status()}`);
    assert((await bodyText(c)).includes("ไม่สามารถเปิดการจองนี้ได้"), "salon booking must not render under clinic tenant");
    const ics = await fetchInPage(c, `/bookings/${ids.bookedA.id}/ics?k=${encodeURIComponent(ids.bookedA.key)}`);
    assert(ics.status === 404, `cross-tenant ics should be 404, got ${ics.status}`);
  });

  /* ============================== summary ============================== */
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("\n==== SUMMARY ====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(4)} ${r.name}${r.info ? ` – ${r.info}` : ""}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  for (const [label, errs] of consoleErrors) {
    if (errs.length) console.log(`console errors [${label}]:\n  ${[...new Set(errs)].slice(0, 12).join("\n  ")}`);
  }
  const md = [
    `## Playwright journey – ${new Date().toISOString()} (BKK ${today})`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.id} ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${(r.info ?? "").replace(/\|/g, "\\|")} |`),
    "",
    `**${passed} passed, ${failed} failed**`,
    "",
    ...[...consoleErrors].filter(([, e]) => e.length).map(([l, e]) => `Console errors [${l}]:\n${[...new Set(e)].map((x) => `- ${x}`).join("\n")}`),
  ].join("\n");
  await writeFile(path.resolve(process.cwd(), "qa/booking-journey-results.md"), md + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
