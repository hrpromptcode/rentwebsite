import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { and, desc, eq, like, getAdminDb, tenants, bookings, eventsOutbox, staff as staffT, staffServices, services as servicesT, availabilityRules, clinicVisits, clinicPackages, patientPackages, patients, payments, recordAccessLogs } from "@rentweb/db";

/**
 * Booking + clinic back-office journey (admin on :3001, storefront on demo-salon.localhost:3000).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/booking-admin-journey.ts [--only 1,2] [--no-shots]
 * Salon: walk-in → calendar chip → check-in → complete; create service → storefront; close Monday → slots API empty
 * (schedule + service are restored / deleted afterwards). Clinic: create patient → visit with encrypted notes → reopen.
 * Screenshots → tooling/screenshots/booking-admin-*.png (1440 + 390).
 */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SALON = "demo-salon";
const CLINIC = "demo-clinic";
const STORE = `http://${SALON}.localhost:3000`;
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const STAMP = `${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, "0")}`;

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
const shotsDir = path.resolve(process.cwd(), "screenshots");
const shots: string[] = [];
let current: Page | null = null;
let failN = 0;
const only = process.argv.slice(2).flatMap((a, i, arr) => (a === "--only" && arr[i + 1] ? arr[i + 1]!.split(",") : []));
const noShots = process.argv.includes("--no-shots");

async function step(name: string, fn: () => Promise<string | void>) {
  if (only.length && !only.includes(name.split(" ")[0]!)) return;
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ step: name, ok: true, note: note ?? undefined });
    console.log(`PASS ${name}${note ? `  — ${note}` : ""}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 6).join(" | ").slice(0, 600);
    results.push({ step: name, ok: false, note: msg });
    console.log(`FAIL ${name}  — ${msg}`);
    if (current) {
      const f = path.join(shotsDir, `booking-admin-fail-${String(++failN).padStart(2, "0")}.png`);
      await current.screenshot({ path: f }).catch(() => {});
      console.log(`     screenshot: ${f}`);
    }
  }
}

async function login(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

const toast = (page: Page, re: RegExp) => expect(page.locator("[data-sonner-toast]").filter({ hasText: re }).first()).toBeVisible({ timeout: 20_000 });
const ymdBangkok = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function shot(page: Page, name: string, fullPage = false) {
  if (noShots) return;
  const f = path.join(shotsDir, `booking-admin-${name}.png`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: f, animations: "disabled", fullPage });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize()?.width ?? 0;
  const warn = scrollW > vw ? `  ⚠ horizontal overflow ${scrollW}px > ${vw}px` : "";
  console.log(`  shot ${f}${warn}`);
  shots.push(f + warn);
}

async function goto(page: Page, url: string) {
  const r = await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  if (!r || r.status() >= 400) throw new Error(`${url} → HTTP ${r?.status()}`);
  await expect(page.locator("text=Application error")).toHaveCount(0);
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const db = getAdminDb();
  const tenantId = async (slug: string) => {
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!t) throw new Error(`${slug} tenant not found`);
    return t.id;
  };
  const salonId = await tenantId(SALON);
  const clinicId = await tenantId(CLINIC);

  const browser = await chromium.launch();
  const state = await login(browser);
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: state, locale: "th-TH" });
  const a = await admin.newPage();
  current = a;
  const adminErrors: string[] = [];
  a.on("response", (r) => {
    if (r.status() >= 500) adminErrors.push(`${r.status()} ${r.url().slice(0, 140)}`);
  });
  a.on("pageerror", (e) => adminErrors.push(`pageerror ${e.message.slice(0, 200)}`));
  const S = `${ADMIN}/t/${SALON}`;
  const C = `${ADMIN}/t/${CLINIC}`;
  const shared: { number?: string; bookingId?: string; date?: string; serviceId?: string; serviceName?: string; staffId?: string; staffHadOwn?: boolean; monRule?: { start: string; end: string } | null; monday?: string; serviceIdForSlots?: string; patientId?: string; hn?: string; visitId?: string } = {};

  /** Walk-in wizard on /bookings/new: first service with a free slot today (else tomorrow). Ends on the booking detail page. */
  const walkIn = async (base: string, name: string, phone: string, shotName?: string) => {
    await goto(a, `${base}/bookings/new`);
    const svc = a.getByTestId("walkin-services").getByRole("radio");
    const n = await svc.count();
    if (!n) throw new Error("no services in walk-in form");
    let picked = "";
    for (let i = 0; i < n; i++) {
      await svc.nth(i).click();
      if (await a.getByText("ยังไม่มีพนักงานที่ทำบริการนี้").count()) continue;
      const slots = a.locator("button[aria-pressed]:not([disabled])");
      await expect(a.getByText("กำลังโหลด").first())
        .toHaveCount(0, { timeout: 20_000 })
        .catch(() => {});
      await a.waitForTimeout(800);
      if (!(await slots.count())) {
        await a.getByRole("button", { name: "พรุ่งนี้" }).first().click();
        await a.waitForTimeout(1500);
      }
      if (await slots.count()) {
        picked = (await svc.nth(i).innerText()).split("\n")[0]!;
        await slots.nth(Math.min(2, (await slots.count()) - 1)).click();
        break;
      }
    }
    if (!picked) throw new Error("no free slot today or tomorrow for any service");
    await a.locator("#wi-name").fill(name);
    await a.locator("#wi-phone").fill(phone);
    await a.locator("#wi-note").fill("ทดสอบจาก journey");
    if (shotName) await shot(a, shotName);
    await Promise.all([a.waitForURL(/\/bookings\/[0-9a-f-]{36}$/, { timeout: 30_000 }), a.getByTestId("walkin-submit").click()]);
    return { number: (await a.getByTestId("booking-number").innerText()).trim(), bookingId: a.url().split("/").pop()!, picked };
  };

  /* ───────── 1 walk-in ───────── */
  await step("1 walk-in booking via /bookings/new", async () => {
    const w = await walkIn(S, `คิวเอ วอล์กอิน ${STAMP}`, "0899990001", "walkin-1440");
    const { number, picked } = w;
    shared.number = number;
    shared.bookingId = w.bookingId;
    await expect(a.getByTestId("booking-status")).toContainText("ยืนยันแล้ว");
    const [row] = await db.select({ startsAt: bookings.startsAt, status: bookings.status, source: bookings.source }).from(bookings).where(eq(bookings.id, shared.bookingId!)).limit(1);
    if (!row || row.status !== "confirmed" || row.source !== "walk_in") throw new Error(`db row ${JSON.stringify(row)}`);
    shared.date = ymdBangkok(row.startsAt);
    const [ev] = await db.select({ type: eventsOutbox.type }).from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, salonId), eq(eventsOutbox.type, "booking.confirmed"))).orderBy(desc(eventsOutbox.createdAt)).limit(1);
    if (!ev) throw new Error("no booking.confirmed event");
    return `${number} ${picked} on ${shared.date} (source walk_in, booking.confirmed emitted)`;
  });

  await step("2 calendar day view shows the chip", async () => {
    if (!shared.number) throw new Error("no booking from step 1");
    await goto(a, `${S}/bookings?date=${shared.date}`);
    await expect(a.getByTestId("day-grid")).toBeVisible();
    const chip = a.locator(`[data-booking="${shared.number}"]`);
    await expect(chip).toBeVisible();
    const cols = await a.locator('[data-testid^="col-"]').count();
    await shot(a, "calendar-day-1440");
    await goto(a, `${S}/bookings?date=${shared.date}&view=week`);
    await expect(a.getByTestId("week-list")).toContainText(shared.number);
    await shot(a, "calendar-week-1440");
    return `${cols} columns incl. ไม่ระบุ`;
  });

  await step("3 open chip → check-in → complete", async () => {
    await goto(a, `${S}/bookings?date=${shared.date}`);
    await a.locator(`[data-booking="${shared.number}"]`).click();
    await a.waitForURL(/\/bookings\/[0-9a-f-]{36}$/);
    await a.getByTestId("status-actions").getByRole("button", { name: "เช็กอิน" }).click();
    await toast(a, /เช็กอินแล้ว/);
    await expect(a.getByTestId("booking-status")).toContainText("เช็กอินแล้ว");
    await a.getByTestId("status-actions").getByRole("button", { name: "เสร็จสิ้น" }).click();
    await toast(a, /เสร็จสิ้นแล้ว/);
    await expect(a.getByTestId("booking-status")).toContainText("เสร็จสิ้น");
    await expect(a.getByTestId("booking-timeline")).toContainText("ให้บริการเสร็จสิ้น");
    await shot(a, "booking-detail-1440");
    const [row] = await db.select({ status: bookings.status, checkedInAt: bookings.checkedInAt, completedAt: bookings.completedAt }).from(bookings).where(eq(bookings.id, shared.bookingId!)).limit(1);
    if (row?.status !== "completed" || !row.checkedInAt || !row.completedAt) throw new Error(`db ${JSON.stringify(row)}`);
    return "completed with checkedInAt + completedAt";
  });

  /* ───────── 4 services ───────── */
  await step("4 create service → visible on storefront /services", async () => {
    const name = `คิวเอ ทรีตเมนต์ ${STAMP}`;
    await goto(a, `${S}/services/new`);
    await a.locator("#svc-name").fill(name);
    await a.locator("#svc-dur").fill("45");
    await a.locator("#svc-price").fill("350");
    await a.locator("#svc-desc").fill("บริการทดสอบจาก journey");
    await a.waitForTimeout(700); // slug suggestion
    await Promise.all([a.waitForURL(/\/services\/[0-9a-f-]{36}$/, { timeout: 30_000 }), a.getByRole("button", { name: "สร้างบริการ" }).click()]);
    shared.serviceId = a.url().split("/").pop();
    shared.serviceName = name;
    await expect(a.getByRole("heading", { level: 1 })).toContainText(name);
    await goto(a, `${S}/services`);
    await expect(a.getByText(name)).toBeVisible();
    await shot(a, "services-1440");
    const sf = await admin.newPage();
    await sf.goto(`${STORE}/services`, { waitUntil: "networkidle", timeout: 90_000 });
    await expect(sf.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await sf.close();
    return `${name} (${shared.serviceId})`;
  });

  /* ───────── 5 staff schedule ───────── */
  await step("5 staff: close Monday → /api/booking/slots empty on Monday", async () => {
    // staff/service pairs that are bookable online; pick the first one that HAS Monday slots before the change
    const links = await db
      .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId, name: staffT.name })
      .from(staffServices)
      .innerJoin(staffT, eq(staffServices.staffId, staffT.id))
      .innerJoin(servicesT, eq(staffServices.serviceId, servicesT.id))
      .where(and(eq(staffServices.tenantId, salonId), eq(staffT.active, true), eq(staffT.acceptsOnlineBooking, true), eq(servicesT.active, true), eq(servicesT.requiresStaff, true)))
      .limit(12);
    if (!links.length) throw new Error("no staff/service link");
    // next Monday (Bangkok)
    const d = new Date();
    let monday = "";
    for (let i = 1; i <= 7; i++) {
      const x = new Date(d.getTime() + i * 86_400_000);
      if (new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(x) === "Mon") {
        monday = ymdBangkok(x);
        break;
      }
    }
    const sf = await admin.newPage();
    await sf.goto(`${STORE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const slotsFor = async (l: { serviceId: string; staffId: string }) => {
      const r = await sf.evaluate(async (u) => {
        const res = await fetch(u, { cache: "no-store" });
        return { status: res.status, text: await res.text() };
      }, `/api/booking/slots?date=${monday}&service=${l.serviceId}&staff=${l.staffId}`);
      if (r.status !== 200) throw new Error(`slots api ${r.status} ${r.text.slice(0, 120)}`);
      return (JSON.parse(r.text) as { slots: Array<{ available: boolean }> }).slots;
    };
    let link: (typeof links)[number] | null = null;
    let before: Array<{ available: boolean }> = [];
    for (const l of links) {
      before = await slotsFor(l);
      if (before.length) {
        link = l;
        break;
      }
    }
    if (!link) throw new Error(`no staff has Monday (${monday}) slots before the change — cannot prove the close`);
    shared.staffId = link.staffId;
    shared.serviceIdForSlots = link.serviceId;
    shared.monday = monday;
    const own = await db.select({ weekday: availabilityRules.weekday, start: availabilityRules.startTime, end: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, salonId), eq(availabilityRules.staffId, link.staffId)));
    shared.staffHadOwn = own.length > 0;
    const monOwn = own.find((r) => r.weekday === 1);
    shared.monRule = monOwn ? { start: monOwn.start.slice(0, 5), end: monOwn.end.slice(0, 5) } : null;

    await goto(a, `${S}/staff/${link.staffId}`);
    const card = a.getByTestId("staff-schedule");
    const inherit = card.getByRole("switch", { name: "ใช้เวลาทำการของร้าน" });
    if ((await inherit.count()) && (await inherit.getAttribute("aria-checked")) === "true") await inherit.click();
    const mon = card.getByRole("switch", { name: "เปิดทำงานวันจันทร์" });
    if ((await mon.getAttribute("aria-checked")) === "true") await mon.click();
    // keep at least one open day so the staff keeps own rules
    await expect(mon).toHaveAttribute("aria-checked", "false");
    await card.getByTestId("save-schedule").click();
    await toast(a, /บันทึกตารางงานแล้ว/);
    await shot(a, "staff-detail-1440");
    const after = await slotsFor(link);
    await sf.close();
    if (after.length !== 0) {
      const now = await db.select({ weekday: availabilityRules.weekday, start: availabilityRules.startTime, end: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, salonId), eq(availabilityRules.staffId, link.staffId)));
      throw new Error(`expected no slots on Monday ${monday} for ${link.name}, got ${after.length}; rules before ${JSON.stringify(own)} after ${JSON.stringify(now)}`);
    }
    return `${link.name}: Monday ${monday} slots ${before.length} → 0`;
  });

  await step("5b restore staff schedule + delete test service", async () => {
    if (shared.staffId) {
      await goto(a, `${S}/staff/${shared.staffId}`);
      const card = a.getByTestId("staff-schedule");
      if (!shared.staffHadOwn) {
        await card.getByRole("switch", { name: "ใช้เวลาทำการของร้าน" }).click();
      } else if (shared.monRule) {
        // Monday was open before: re-open it with the exact original hours
        await card.getByRole("switch", { name: "เปิดทำงานวันจันทร์" }).click();
        await card.getByLabel("เวลาเริ่มวันจันทร์").fill(shared.monRule.start);
        await card.getByLabel("เวลาเลิกวันจันทร์").fill(shared.monRule.end);
      }
      await card.getByTestId("save-schedule").click();
      await toast(a, /ใช้เวลาทำการของร้านแล้ว|บันทึกตารางงานแล้ว/);
      const rows = await db.select({ weekday: availabilityRules.weekday, start: availabilityRules.startTime, end: availabilityRules.endTime }).from(availabilityRules).where(and(eq(availabilityRules.tenantId, salonId), eq(availabilityRules.staffId, shared.staffId)));
      const mon = rows.find((r) => r.weekday === 1);
      if (shared.staffHadOwn && shared.monRule && (mon?.start.slice(0, 5) !== shared.monRule.start || mon?.end.slice(0, 5) !== shared.monRule.end)) throw new Error(`Monday not restored: ${JSON.stringify(mon)} vs ${JSON.stringify(shared.monRule)}`);
      if (!shared.staffHadOwn && rows.length) throw new Error("staff still has own rules");
    }
    if (shared.serviceId) {
      await goto(a, `${S}/services/${shared.serviceId}`);
      await a.getByRole("button", { name: "ลบ", exact: true }).click();
      await a.getByRole("dialog").getByRole("button", { name: "ลบบริการ" }).click();
      await a.waitForURL(/\/services$/, { timeout: 20_000 });
      const left = await db.select({ id: servicesT.id }).from(servicesT).where(eq(servicesT.id, shared.serviceId));
      if (left.length) throw new Error("service not deleted");
    }
    return shared.staffHadOwn ? `Monday re-opened ${shared.monRule?.start}–${shared.monRule?.end} (verified in availability_rules)` : "staff back on shop hours";
  });

  await step("6 salon pages render (staff list, week, new)", async () => {
    await goto(a, `${S}/staff`);
    await expect(a.getByTestId("staff-list")).toBeVisible();
    await expect(a.getByTestId("business-hours")).toBeVisible();
    await shot(a, "staff-1440");
  });

  /* ───────── 7 clinic ───────── */
  await step("7 clinic module gate on salon", async () => {
    await goto(a, `${S}/clinic/patients`);
    await expect(a.getByText("โมดูลคลินิกไม่ได้เปิดใช้")).toBeVisible();
  });

  await step("8 clinic: create patient", async () => {
    await goto(a, `${C}/clinic/patients`);
    await a.getByRole("button", { name: /เพิ่มผู้ป่วย/ }).click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#pt-first").fill("คิวเอ");
    await dlg.locator("#pt-last").fill(`ผู้ป่วย ${STAMP}`);
    await dlg.locator("#pt-phone").fill("0811112222");
    await dlg.locator("#pt-allergies").fill("แพ้ยาเพนิซิลลิน");
    await Promise.all([a.waitForURL(/\/clinic\/patients\/[0-9a-f-]{36}$/, { timeout: 30_000 }), dlg.getByRole("button", { name: /บันทึก|สร้าง/ }).click()]);
    shared.patientId = a.url().split("/").pop();
    const [p] = await db.select({ hn: patients.hn }).from(patients).where(eq(patients.id, shared.patientId!)).limit(1);
    if (!p) throw new Error("patient row missing");
    shared.hn = p.hn;
    await expect(a.getByText(p.hn).first()).toBeVisible();
    const logs = await db.select({ id: recordAccessLogs.id }).from(recordAccessLogs).where(and(eq(recordAccessLogs.tenantId, clinicId), eq(recordAccessLogs.patientId, shared.patientId!)));
    if (!logs.length) throw new Error("no record_access_logs row for the profile view");
    await shot(a, "patient-1440");
    return `${p.hn} (access logs ${logs.length})`;
  });

  const SECRET = `บันทึกลับ ${STAMP}: ผิวแห้ง แนะนำครีม`;
  await step("9 clinic: create visit with encrypted notes", async () => {
    if (!shared.patientId) throw new Error("no patient");
    await goto(a, `${C}/clinic/visits`);
    await a.getByRole("button", { name: /เปิดการตรวจ|สร้างการตรวจ/ }).first().click();
    const dlg = a.getByRole("dialog");
    await dlg.getByPlaceholder(/ค้นหาผู้ป่วย/).fill(shared.hn!);
    await dlg.getByRole("listbox", { name: "ผลการค้นหาผู้ป่วย" }).getByRole("option").first().click();
    await expect(dlg.getByText(shared.hn!)).toBeVisible();
    await dlg.locator("#vc-complaint").fill("ผื่นแดงที่แขน");
    await Promise.all([a.waitForURL(/\/clinic\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 }), dlg.getByRole("button", { name: /เปิดการตรวจ/ }).click()]);
    shared.visitId = a.url().split("/").pop();
    await a.locator("#v-bp").fill("120/80");
    await a.locator("#v-hr").fill("72");
    await a.locator("#v-notes").fill(SECRET);
    await a.locator("#v-diagnosis").fill("Contact dermatitis");
    await a.getByRole("button", { name: "บันทึกการตรวจ" }).click();
    await toast(a, /บันทึกการตรวจแล้ว/);
    const [v] = await db.select({ notes: clinicVisits.notesEncrypted }).from(clinicVisits).where(eq(clinicVisits.id, shared.visitId!)).limit(1);
    if (!v?.notes) throw new Error("notes not stored");
    if (v.notes.includes("บันทึกลับ")) throw new Error("notes stored in plain text");
    await shot(a, "visit-1440", true);
    return `visit ${shared.visitId} notes ciphertext ${v.notes.slice(0, 16)}…`;
  });

  await step("10 reopen visit → notes decrypt", async () => {
    if (!shared.visitId) throw new Error("no visit");
    await goto(a, `${C}/clinic/visits`);
    await goto(a, `${C}/clinic/visits/${shared.visitId}`);
    await expect(a.locator("#v-notes")).toHaveValue(SECRET);
    await expect(a.locator("#v-bp")).toHaveValue("120/80");
    return "plain text restored";
  });

  await step("10b visit: add procedure → complete with cash → payment paid", async () => {
    if (!shared.visitId) throw new Error("no visit");
    await goto(a, `${C}/clinic/visits/${shared.visitId}`);
    const pick = a.getByRole("combobox", { name: "เพิ่มหัตถการจากรายการบริการ" });
    const opt = await pick.locator("option").nth(1).getAttribute("value");
    if (!opt) throw new Error("no service to add as procedure");
    await pick.selectOption(opt);
    await a.getByRole("button", { name: "เพิ่มยา" }).click();
    await a.getByLabel("ชื่อยา 1").fill("Cetirizine 10 mg");
    await a.getByLabel("วิธีใช้ยา 1").fill("1 เม็ด ก่อนนอน");
    await a.getByLabel("จำนวนยา 1").fill("10");
    await a.getByLabel("ราคาต่อหน่วย 1").fill("5");
    const total = (await a.getByTestId("visit-total").innerText()).trim();
    await a.getByRole("button", { name: "บันทึกการตรวจ" }).click();
    await toast(a, /บันทึกการตรวจแล้ว/);
    await a.getByTestId("complete-visit").click();
    const dlg = a.getByRole("dialog");
    await expect(dlg.getByRole("radio", { name: /เงินสด/ })).toHaveAttribute("aria-checked", "true");
    await dlg.getByTestId("confirm-complete").click();
    await toast(a, /ปิดการตรวจและรับชำระเงินแล้ว/);
    await expect(a.getByTestId("visit-status")).toContainText("เสร็จสิ้น");
    const [v] = await db.select({ status: clinicVisits.status, paymentStatus: clinicVisits.paymentStatus, paymentId: clinicVisits.paymentId, total: clinicVisits.total }).from(clinicVisits).where(eq(clinicVisits.id, shared.visitId!)).limit(1);
    if (v?.status !== "completed" || v.paymentStatus !== "paid" || !v.paymentId) throw new Error(`visit ${JSON.stringify(v)}`);
    const [pay] = await db.select({ status: payments.status, amount: payments.amount, method: payments.method, refType: payments.refType }).from(payments).where(eq(payments.id, v.paymentId)).limit(1);
    if (pay?.status !== "paid" || pay.amount !== v.total || pay.method !== "cash") throw new Error(`payment ${JSON.stringify(pay)}`);
    return `total ${total} → payment ${pay.refType}/${pay.method} paid ${pay.amount / 100} THB`;
  });

  const PKG = `คิวเอ คอร์ส ${STAMP}`;
  await step("10c packages: create a 2-session package", async () => {
    await goto(a, `${C}/clinic/packages`);
    await a.getByTestId("new-package").click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#pk-name").fill(PKG);
    await dlg.locator("#pk-sessions").fill("2");
    await dlg.locator("#pk-price").fill("1000");
    await dlg.locator("#pk-compare").fill("1500");
    await dlg.getByRole("button", { name: "สร้างแพ็กเกจ" }).click();
    await toast(a, /สร้างแพ็กเกจแล้ว/);
    await expect(a.locator(`[data-package="${PKG}"]`)).toBeVisible();
    const [row] = await db.select({ price: clinicPackages.price, sessions: clinicPackages.sessions }).from(clinicPackages).where(and(eq(clinicPackages.tenantId, clinicId), eq(clinicPackages.name, PKG))).limit(1);
    if (row?.price !== 100_000 || row.sessions !== 2) throw new Error(`db ${JSON.stringify(row)}`);
    return `${PKG} 2 ครั้ง ฿1,000`;
  });

  await step("10d patient: consent toggle + sell package + ใช้ 1 ครั้ง ×2 → exhausted", async () => {
    if (!shared.patientId) throw new Error("no patient");
    await goto(a, `${C}/clinic/patients/${shared.patientId}`);
    const consent = a.getByTestId("consents").getByRole("switch", { name: "ยินยอมรับการรักษา" });
    if ((await consent.getAttribute("aria-checked")) !== "true") {
      await consent.click();
      await toast(a, /บันทึกความยินยอมแล้ว/);
    }
    await expect(a.getByTestId("consents")).toContainText("ยินยอมเมื่อ");
    const [pc] = await db.select({ consents: patients.consents }).from(patients).where(eq(patients.id, shared.patientId!)).limit(1);
    if (!pc?.consents?.treatment?.at) throw new Error(`consent not stored ${JSON.stringify(pc)}`);
    const box = a.getByTestId("patient-packages");
    const sel = box.getByRole("combobox", { name: "เลือกคอร์ส" });
    const value = await sel.locator("option", { hasText: PKG }).getAttribute("value");
    if (!value) throw new Error("test package not offered for sale");
    await sel.selectOption(value);
    await box.getByRole("button", { name: "ขายคอร์ส" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "ยืนยันการขาย" }).click();
    await toast(a, /ขายแพ็กเกจ/);
    const card = a.locator(`[data-package="${PKG}"]`);
    await expect(card.getByTestId("sessions-left")).toContainText("2/2");
    for (const expected of [/เหลือ 1 ครั้ง/, /ใช้ครั้งสุดท้ายแล้ว/]) {
      await card.getByRole("button", { name: "ใช้ 1 ครั้ง" }).click();
      await a.getByRole("dialog").getByRole("button", { name: "ใช้ 1 ครั้ง" }).click();
      await toast(a, expected);
      await a.waitForTimeout(600);
    }
    await expect(card).toContainText("ใช้ครบแล้ว");
    await expect(card.getByRole("button", { name: "ใช้ 1 ครั้ง" })).toHaveCount(0);
    const [pp] = await db.select({ status: patientPackages.status, used: patientPackages.sessionsUsed }).from(patientPackages).where(and(eq(patientPackages.patientId, shared.patientId!), eq(patientPackages.packageName, PKG))).limit(1);
    if (pp?.status !== "exhausted" || pp.used !== 2) throw new Error(`patient package ${JSON.stringify(pp)}`);
    const logs = await db.select({ id: recordAccessLogs.id }).from(recordAccessLogs).where(and(eq(recordAccessLogs.tenantId, clinicId), eq(recordAccessLogs.patientId, shared.patientId!)));
    return `consent stored, package exhausted (2/2 used), access logs ${logs.length}`;
  });

  await step("10e packages: close sale of the test package (sold → delete refused)", async () => {
    await goto(a, `${C}/clinic/packages`);
    const card = a.locator(`[data-package="${PKG}"]`);
    await card.getByRole("button", { name: `ลบ ${PKG}` }).click();
    await a.getByRole("dialog").getByRole("button", { name: "ลบแพ็กเกจ" }).click();
    await toast(a, /ลบไม่ได้/);
    await card.getByRole("switch", { name: `ปิดการขาย ${PKG}` }).click();
    await toast(a, /ปิดการขายแพ็กเกจแล้ว/);
    const [row] = await db.select({ active: clinicPackages.active }).from(clinicPackages).where(and(eq(clinicPackages.tenantId, clinicId), eq(clinicPackages.name, PKG))).limit(1);
    if (row?.active !== false) throw new Error("package still active");
    return "delete refused (owned), sale closed";
  });

  await step("10f clinic: walk-in booking → queue “รับเข้าตรวจ” → visit linked (then cancel visit)", async () => {
    const phone = `087${STAMP.padStart(4, "0")}${String(Date.now()).slice(-3)}`;
    const w = await walkIn(C, `คิวเอ นัดคลินิก ${STAMP}`, phone);
    const [bk] = await db.select({ startsAt: bookings.startsAt }).from(bookings).where(eq(bookings.id, w.bookingId)).limit(1);
    const day = ymdBangkok(bk!.startsAt);
    await goto(a, `${C}/clinic/visits?date=${day}`);
    const row = a.getByTestId("booking-queue").locator(`[data-booking="${w.number}"]`);
    await expect(row).toContainText("ผู้ป่วยใหม่");
    await Promise.all([a.waitForURL(/\/clinic\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 }), row.getByRole("button", { name: /ลงทะเบียน \+ ตรวจ|รับเข้าตรวจ/ }).click()]);
    const visitId = a.url().split("/").pop()!;
    await expect(a.getByRole("link", { name: w.number })).toBeVisible();
    const [v] = await db.select({ bookingId: clinicVisits.bookingId, patientId: clinicVisits.patientId, procedures: clinicVisits.procedures }).from(clinicVisits).where(eq(clinicVisits.id, visitId)).limit(1);
    if (v?.bookingId !== w.bookingId) throw new Error(`visit not linked ${JSON.stringify(v)}`);
    const [pt] = await db.select({ hn: patients.hn, phone: patients.phone }).from(patients).where(eq(patients.id, v.patientId)).limit(1);
    const [b2] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, w.bookingId)).limit(1);
    if (b2?.status !== "checked_in") throw new Error(`booking status ${b2?.status}`);
    await a.getByRole("button", { name: "ยกเลิกการตรวจ" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "ยกเลิกการตรวจ" }).click();
    await toast(a, /ยกเลิกการตรวจแล้ว/);
    await expect(a.getByTestId("visit-status")).toContainText("ยกเลิก");
    return `${w.number} (${w.picked}) → new patient ${pt?.hn} ${pt?.phone}, procedure prefilled ${v.procedures.length}, booking checked_in; visit cancelled`;
  });

  await step("11 clinic packages + visits list render", async () => {
    await goto(a, `${C}/clinic/packages`);
    await expect(a.getByRole("heading", { level: 1 })).toContainText(/คอร์ส|แพ็กเกจ/);
    await shot(a, "packages-1440");
    await goto(a, `${C}/clinic/visits`);
    await shot(a, "visits-1440");
    await goto(a, `${C}/clinic/patients`);
    await shot(a, "patients-1440");
  });

  /* ───────── 13 cleanup (runs last, see below) ───────── */
  const cleanup = async () => {
    // QA packages can't be deleted from the UI once sold (FK restrict) — remove them and their test ownerships here
    const qa = await db.select({ id: clinicPackages.id }).from(clinicPackages).where(and(eq(clinicPackages.tenantId, clinicId), like(clinicPackages.name, "คิวเอ คอร์ส %")));
    for (const p of qa) {
      await db.delete(patientPackages).where(and(eq(patientPackages.tenantId, clinicId), eq(patientPackages.packageId, p.id)));
      await db.delete(clinicPackages).where(eq(clinicPackages.id, p.id));
    }
    return `removed ${qa.length} QA package(s)`;
  };

  /* ───────── 12 phone screenshots ───────── */
  await step("12 phone 390 screenshots + overflow check", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: state, isMobile: true, hasTouch: true, locale: "th-TH" });
    const p = await phone.newPage();
    current = p;
    const pages: Array<[string, string]> = [
      ["calendar-day-390", `${S}/bookings${shared.date ? `?date=${shared.date}` : ""}`],
      ["calendar-week-390", `${S}/bookings?view=week${shared.date ? `&date=${shared.date}` : ""}`],
      ["walkin-390", `${S}/bookings/new`],
      ...(shared.bookingId ? ([["booking-detail-390", `${S}/bookings/${shared.bookingId}`]] as Array<[string, string]>) : []),
      ["services-390", `${S}/services`],
      ["staff-390", `${S}/staff`],
      ...(shared.staffId ? ([["staff-detail-390", `${S}/staff/${shared.staffId}`]] as Array<[string, string]>) : []),
      ["patients-390", `${C}/clinic/patients`],
      ...(shared.patientId ? ([["patient-390", `${C}/clinic/patients/${shared.patientId}`]] as Array<[string, string]>) : []),
      ["visits-390", `${C}/clinic/visits`],
      ...(shared.visitId ? ([["visit-390", `${C}/clinic/visits/${shared.visitId}`]] as Array<[string, string]>) : []),
      ["packages-390", `${C}/clinic/packages`],
    ];
    const overflow: string[] = [];
    for (const [name, url] of pages) {
      await goto(p, url);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > 390) overflow.push(`${name} ${sw}px`);
      await shot(p, name);
    }
    await phone.close();
    current = a;
    if (overflow.length) throw new Error(`horizontal overflow: ${overflow.join(", ")}`);
    return `${pages.length} pages, no page-level overflow`;
  });

  await step("13 cleanup QA packages", cleanup);
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} steps passed`);
  if (adminErrors.length) console.log(`admin errors:\n  ${[...new Set(adminErrors)].slice(0, 20).join("\n  ")}`);
  await writeFile(path.resolve(process.cwd(), "qa/booking-admin-journey-results.json"), JSON.stringify({ at: new Date().toISOString(), shared, results, shots, adminErrors: [...new Set(adminErrors)] }, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
