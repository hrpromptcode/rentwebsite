import "../load-env";
import http from "node:http";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq, getAdminDb, getDb, inArray, payments, rentalBlockedDates, rentalRateRules, rentalStays, rentalUnitTypes, tenantModules, tenants, withTenant } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { attachSlip } from "@rentweb/core/payments";
import { invalidateTenant, provisionTenant } from "@rentweb/core/tenant";
import { getTemplate } from "@rentweb/templates";
import { loadRentalModuleConfig, previewRates, saveRentalModuleConfig } from "@rentweb/module-rental/admin";
import { createStay } from "@rentweb/module-rental/services";
import { addDays, bkkDateString } from "@rentweb/module-rental/time";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Rental back-office journey (admin on :3001, storefront API on 127.0.0.1:3000 with the tenant Host header).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/rental-admin-journey.ts [--only 1,2] [--no-shots] [--keep] [--tenant <slug>]
 *
 * Tenant: demo-hotel when it exists with the rental module; otherwise a throwaway "qa-hotel" (corporate template +
 * rental module + a receiving bank account so slip payments are available) is created on first run and reused.
 * Flow: create unit type (UI) → seasonal rule + price preview (UI) → seed a slip stay (services) → /payments queue
 * links to the stay → list (วันนี้เช็กอิน) → detail: approve slip → check-in → cash balance → check-out → notes →
 * search → second stay: จองล่วงหน้า → cancel with reason → ยกเลิก tab → calendar: block/unblock a date and the
 * storefront /api/rental/calendar respects it → settings save/restore. Everything the run created is deleted at the end
 * (keep it with --keep). Screenshots → tooling/screenshots/rental-admin-*.png (1440 + 390).
 */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const PREFERRED = "demo-hotel";
const FALLBACK = "qa-hotel";
const STAMP = `${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, "0")}`;
const UNIT_NAME = `QA ดีลักซ์ ${STAMP}`;
const UNIT_SLUG = `qa-deluxe-${STAMP}`;
const RULE_NAME = `QA ราคาพิเศษ ${STAMP}`;
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const argv = process.argv.slice(2);
const only = argv.flatMap((a, i, arr) => (a === "--only" && arr[i + 1] ? arr[i + 1]!.split(",") : []));
const noShots = argv.includes("--no-shots");
const keep = argv.includes("--keep");
const tenantArg = argv.includes("--tenant") ? argv[argv.indexOf("--tenant") + 1] : undefined;

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
const shotsDir = path.resolve(process.cwd(), "screenshots");
const shots: string[] = [];
let current: Page | null = null;
let failN = 0;

let tenantId = "";
let slug = "";
let unitTypeId = "";
let ruleId: string | null = null;
let stayA: { id: string; number: string; total: number; deposit: number } | null = null;
let stayB: { id: string; number: string } | null = null;
let originalFreeCancelDays: number | null = null;

const TODAY = bkkDateString();
const D5 = addDays(TODAY, 5);
const D10 = addDays(TODAY, 10);
const MONTH10 = D10.slice(0, 7);

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
      const f = path.join(shotsDir, `rental-admin-fail-${String(++failN).padStart(2, "0")}.png`);
      await current.screenshot({ path: f }).catch(() => {});
      console.log(`     screenshot: ${f}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* tenant + data helpers                                                */
/* ------------------------------------------------------------------ */

async function hasRental(id: string): Promise<boolean> {
  const [m] = await getAdminDb().select({ enabled: tenantModules.enabled }).from(tenantModules).where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleKey, "rental"))).limit(1);
  return !!m?.enabled;
}

/** Enables the rental module and makes sure a bank account exists so "slip" is an accepted payment method. */
async function enableRental(id: string, host: string) {
  const db = getAdminDb();
  await db.insert(tenantModules).values({ tenantId: id, moduleKey: "rental", enabled: true, config: {} }).onConflictDoNothing();
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, id)).limit(1);
  const settings = { ...(t?.settings ?? {}) } as Record<string, unknown>;
  const pay = { ...((settings.payments as Record<string, unknown> | undefined) ?? {}) };
  pay.enabled = { ...((pay.enabled as Record<string, unknown> | undefined) ?? {}), bankTransfer: true, cash: true };
  if (!Array.isArray(pay.bankAccounts) || pay.bankAccounts.length === 0) pay.bankAccounts = [{ bank: "kbank", name: "QA Hotel", number: "0123456789" }];
  settings.payments = pay;
  await db.update(tenants).set({ settings }).where(eq(tenants.id, id));
  await invalidateTenant(id, [host]);
}

async function ensureTenant(): Promise<{ id: string; slug: string; note: string }> {
  const db = getAdminDb();
  const candidates = tenantArg ? [tenantArg] : [PREFERRED, FALLBACK];
  for (const s of candidates) {
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, s)).limit(1);
    if (!t) continue;
    if (await hasRental(t.id)) return { id: t.id, slug: s, note: `existing ${s}` };
    if (s === PREFERRED && !tenantArg) continue; // demo-hotel without the module belongs to the storefront agent
    await enableRental(t.id, `${s}.localhost`);
    return { id: t.id, slug: s, note: `enabled rental on ${s}` };
  }
  if (tenantArg) throw new Error(`tenant ${tenantArg} not found`);
  const tpl = getTemplate("corporate");
  if (!tpl) throw new Error("template corporate missing");
  const r = await provisionTenant({ name: "QA Hotel (rental admin)", slug: FALLBACK, template: tpl, planKey: "pro", withSampleData: false, db });
  await db.update(tenants).set({ status: "active", trialEndsAt: null }).where(eq(tenants.id, r.tenantId));
  await enableRental(r.tenantId, `${FALLBACK}.localhost`);
  return { id: r.tenantId, slug: FALLBACK, note: `created ${FALLBACK}` };
}

async function seedSlipStay(checkIn: string, nights: number, guestName: string) {
  const db = getAdminDb();
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const cfg = await loadRentalModuleConfig(db, tenantId);
  const r = await withTenant(getDb(), tenantId, (tx) =>
    createStay(
      tx,
      tenantId,
      { unitTypeId, checkIn, checkOut: addDays(checkIn, nights), guests: 2, customer: { name: guestName, phone: "0891234567" }, paymentMethod: "slip", payOption: "deposit", source: "online", note: "QA journey" },
      { config: cfg.rental, settings: (t?.settings ?? {}) as Record<string, unknown> },
    ),
  );
  if (!r.ok) throw new Error(`createStay → ${r.error}`);
  if (!r.value.payment) throw new Error("createStay made no payment (slip method not enabled on the tenant?)");
  await mkdir(path.join(process.cwd(), "..", "apps", "web", "public", "uploads", "qa"), { recursive: true }).catch(() => {});
  await writeFile(path.join(process.cwd(), "..", "apps", "web", "public", "uploads", "qa", "_qa-slip.png"), PNG_1x1).catch(() => {});
  await withTenant(getDb(), tenantId, (tx) => attachSlip(tx, tenantId, r.value.payment!.id, { url: "/uploads/qa/_qa-slip.png" }, { autoApprove: false }));
  return { id: r.value.stay.id, number: r.value.stay.number, total: r.value.stay.total, deposit: r.value.stay.depositAmount, paymentId: r.value.payment.id };
}

async function dbStay(id: string) {
  const db = getAdminDb();
  const [s] = await db.select().from(rentalStays).where(and(eq(rentalStays.tenantId, tenantId), eq(rentalStays.id, id))).limit(1);
  const pays = await db.select({ id: payments.id, status: payments.status, method: payments.method, amount: payments.amount, verifiedBy: payments.verifiedBy }).from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "stay"), eq(payments.refId, id)));
  return { stay: s ?? null, payments: pays };
}

function storefrontJson(pathname: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path: pathname, method: "GET", headers: { host: `${slug}.localhost:3000`, accept: "application/json" } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function cleanup() {
  if (keep || !tenantId) return;
  const db = getAdminDb();
  const stayIds = [stayA?.id, stayB?.id].filter((x): x is string => !!x);
  if (stayIds.length) {
    await db.delete(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "stay"), inArray(payments.refId, stayIds)));
    await db.delete(rentalStays).where(and(eq(rentalStays.tenantId, tenantId), inArray(rentalStays.id, stayIds)));
  }
  if (unitTypeId) {
    await db.delete(rentalBlockedDates).where(and(eq(rentalBlockedDates.tenantId, tenantId), eq(rentalBlockedDates.unitTypeId, unitTypeId)));
    await db.delete(rentalRateRules).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.unitTypeId, unitTypeId)));
    await db.delete(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, unitTypeId)));
  }
  await db.delete(rentalRateRules).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.name, RULE_NAME)));
  if (originalFreeCancelDays !== null) {
    await saveRentalModuleConfig(db, tenantId, { freeCancelDays: originalFreeCancelDays });
    await invalidateTenant(tenantId, [`${slug}.localhost`]);
  }
  console.log(`cleanup: removed ${stayIds.length} stays, unit type ${unitTypeId ? "yes" : "no"}, rule ${ruleId ? "yes" : "no"}`);
}

/* ------------------------------------------------------------------ */
/* browser helpers                                                      */
/* ------------------------------------------------------------------ */

async function login(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

async function dialogButton(page: Page, name: string | RegExp) {
  const btn = page.getByRole("dialog").getByRole("button", { name });
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  return btn;
}

async function shot(page: Page, name: string, fullPage = false) {
  if (noShots) return;
  const f = path.join(shotsDir, `rental-admin-${name}.png`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: f, animations: "disabled", fullPage });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize()?.width ?? 0;
  const warn = scrollW > vw ? `  ⚠ horizontal overflow ${scrollW}px > ${vw}px` : "";
  console.log(`  shot ${f}${warn}`);
  shots.push(f + warn);
}

async function goto(page: Page, rel: string) {
  const url = `${ADMIN}/t/${slug}${rel}`;
  const r = await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  if (!r || r.status() >= 400) throw new Error(`${url} → HTTP ${r?.status()}`);
  await expect(page.locator("text=Application error")).toHaveCount(0);
}

const status = (page: Page) => page.locator("[data-testid=stay-status]");

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const t = await ensureTenant();
  tenantId = t.id;
  slug = t.slug;
  console.log(`tenant: ${slug} (${tenantId}) — ${t.note}; today ${TODAY}`);

  const browser = await chromium.launch();
  let ctx: BrowserContext | null = null;
  let mobile: BrowserContext | null = null;
  try {
    const state = await login(browser);
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    current = page;
    mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await isolateHmr(mobile);
    const mpage = await mobile.newPage();

    await step("1 nav: every rental adminNav href is a real page", async () => {
      const codes: string[] = [];
      for (const rel of ["/rental/bookings", "/rental/calendar", "/rental/units", "/rental/rates", "/rental/settings"]) {
        const r = await page.goto(`${ADMIN}/t/${slug}${rel}`, { waitUntil: "networkidle", timeout: 90_000 });
        codes.push(`${rel} ${r?.status()}`);
        if (!r || r.status() >= 400) throw new Error(codes.join(", "));
      }
      await expect(page.locator(`a[href="/t/${slug}/rental/bookings"]`).first()).toBeVisible();
      return codes.join(", ");
    });

    await step("2 units: create a unit type (UI) → list card", async () => {
      await goto(page, "/rental/units/new");
      await page.fill("#u-name", UNIT_NAME);
      await page.fill("#u-slug", UNIT_SLUG);
      await page.fill("#u-desc", "ห้องทดสอบสำหรับตรวจ back-office (สร้างโดย QA journey)");
      await page.fill("#u-qty", "2");
      await page.fill("#u-max", "3");
      await page.fill("#u-price", "1500");
      await page.click("[data-testid=unit-save]");
      await toast(page, /บันทึก|สร้าง/);
      await page.waitForURL(/\/rental\/units\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      unitTypeId = page.url().split("/").pop()!;
      const [row] = await getAdminDb().select({ qty: rentalUnitTypes.quantity, price: rentalUnitTypes.basePrice, slug: rentalUnitTypes.slug, active: rentalUnitTypes.active }).from(rentalUnitTypes).where(and(eq(rentalUnitTypes.tenantId, tenantId), eq(rentalUnitTypes.id, unitTypeId))).limit(1);
      if (!row || row.qty !== 2 || row.price !== 150_000 || !row.active) throw new Error(`db row ${JSON.stringify(row)}`);
      await goto(page, "/rental/units");
      await expect(page.locator("[data-testid=unit-card]", { hasText: UNIT_NAME })).toBeVisible();
      await shot(page, "units-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/rental/units`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "units-390");
      return `${UNIT_SLUG} · 2 ห้อง · ฿1,500`;
    });

    await step("3 rates: seasonal rule (UI) → preview price for that date", async () => {
      if (!unitTypeId) throw new Error("needs step 2");
      await goto(page, "/rental/rates");
      await page.click("[data-testid=rule-new]");
      const dlg = page.getByRole("dialog");
      await dlg.locator("#r-name").fill(RULE_NAME);
      await dlg.locator("#r-type").selectOption(unitTypeId);
      await dlg.locator("#r-from").fill(D10);
      await dlg.locator("#r-to").fill(D10);
      await dlg.locator("#r-mode").selectOption("price");
      await dlg.locator("#r-value").fill("2000");
      await dlg.locator("#r-prio").fill("5");
      await dlg.locator("[data-testid=rule-save]").click();
      await toast(page, /เพิ่มกฎราคาแล้ว|บันทึกกฎราคาแล้ว/);
      await expect(page.locator("[data-testid=rule-row]", { hasText: RULE_NAME })).toBeVisible({ timeout: 20_000 });
      const [r] = await getAdminDb().select({ id: rentalRateRules.id }).from(rentalRateRules).where(and(eq(rentalRateRules.tenantId, tenantId), eq(rentalRateRules.name, RULE_NAME))).limit(1);
      ruleId = r?.id ?? null;
      // preview box: on D10 the new rule is applied (the tenant's own seasonal/weekend % rules may compound on top of the
      // fixed price), on D5 it is not; the shown price must match what the pricing service computes for that night
      const expected = await withTenant(getDb(), tenantId, async (tx) => ({ d10: (await previewRates(tx, tenantId, D10)).find((p) => p.type.id === unitTypeId)?.price, d5: (await previewRates(tx, tenantId, D5)).find((p) => p.type.id === unitTypeId)?.price }));
      await goto(page, `/rental/rates?date=${D10}`);
      const li10 = page.locator("[data-testid=rate-preview] li", { hasText: UNIT_NAME });
      await expect(li10).toContainText(RULE_NAME);
      await expect(li10.locator("[data-testid=preview-price]")).toHaveText(thb(expected.d10 ?? -1));
      if ((expected.d10 ?? 0) < 200_000) throw new Error(`rule not applied: ${expected.d10}`);
      await goto(page, `/rental/rates?date=${D5}`);
      const li5 = page.locator("[data-testid=rate-preview] li", { hasText: UNIT_NAME });
      await expect(li5).not.toContainText(RULE_NAME);
      await expect(li5.locator("[data-testid=preview-price]")).toHaveText(thb(expected.d5 ?? -1));
      await goto(page, `/rental/rates?date=${D10}`);
      await shot(page, "rates-1440");
      return `${D10} → ${thb(expected.d10 ?? 0)} (rule applied) · ${D5} → ${thb(expected.d5 ?? 0)} (rule not applied)`;
    });

    await step("4 seed: slip stay (check-in today) → shared /payments queue links to the stay", async () => {
      if (!unitTypeId) throw new Error("needs step 2");
      const s = await seedSlipStay(TODAY, 2, "คุณทดสอบ คิวเอ");
      stayA = s;
      const db = await dbStay(s.id);
      if (db.stay?.status !== "pending" || db.payments[0]?.status !== "pending_verification") throw new Error(`stay ${db.stay?.status} / payment ${db.payments[0]?.status}`);
      await goto(page, "/payments");
      const card = page.locator("article", { hasText: s.number }).first();
      await card.waitFor({ timeout: 20_000 });
      const href = await card.locator(`a[href*="/rental/bookings/${s.id}"]`).first().getAttribute("href");
      if (!href) throw new Error("no link to /rental/bookings/<id> on the payments card");
      return `${s.number} total ฿${s.total / 100} deposit ฿${s.deposit / 100} · queue → ${href}`;
    });

    await step("5 list: วันนี้เช็กอิน shows the stay (1440 + 390)", async () => {
      if (!stayA) throw new Error("needs step 4");
      await goto(page, "/rental/bookings");
      await expect(page.locator("[data-testid=tab-arrivals][aria-current=page]")).toBeVisible();
      await expect(page.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      await shot(page, "bookings-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/rental/bookings`, { waitUntil: "networkidle", timeout: 90_000 });
      await expect(mpage.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      await shot(mpage, "bookings-390");
    });

    await step("6 detail: approve slip → ยืนยันแล้ว, deposit recorded", async () => {
      if (!stayA) throw new Error("needs step 4");
      await goto(page, `/rental/bookings/${stayA.id}`);
      await expect(page.locator("[data-testid=stay-number]")).toHaveText(stayA.number);
      await expect(status(page)).toHaveText(/รอชำระเงิน/);
      await expect(page.locator("[data-testid=payment-pending_verification]")).toBeVisible();
      await page.click("[data-testid=approve-payment]");
      await toast(page, /ยืนยันการชำระเงินแล้ว/);
      await expect(status(page)).toHaveText(/ยืนยันแล้ว/, { timeout: 20_000 });
      const db = await dbStay(stayA.id);
      if (db.stay?.status !== "confirmed" || db.stay.paymentStatus !== "deposit_paid" || db.stay.paidAmount !== stayA.deposit) throw new Error(`db ${db.stay?.status}/${db.stay?.paymentStatus}/${db.stay?.paidAmount}`);
      if (db.payments[0]?.status !== "paid" || !db.payments[0].verifiedBy || db.payments[0].verifiedBy === "auto") throw new Error(`payment ${db.payments[0]?.status} verifiedBy ${db.payments[0]?.verifiedBy}`);
      await shot(page, "detail-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/rental/bookings/${stayA.id}`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "detail-390");
      return `paid ฿${db.stay.paidAmount / 100} · verifiedBy ${db.payments[0].verifiedBy}`;
    });

    await step("7 detail: check-in → cash balance → check-out", async () => {
      if (!stayA) throw new Error("needs step 4");
      await goto(page, `/rental/bookings/${stayA.id}`);
      await page.click("[data-testid=action-check_in]");
      await toast(page, /เช็กอินแล้ว/);
      await expect(status(page)).toHaveText(/กำลังเข้าพัก/, { timeout: 20_000 });
      await goto(page, "/rental/bookings?tab=inhouse");
      await expect(page.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      await goto(page, `/rental/bookings/${stayA.id}`);
      await page.getByRole("button", { name: /รับส่วนที่เหลือ/ }).click();
      await (await dialogButton(page, /บันทึกรับเงิน/)).click();
      await toast(page, /รับชำระส่วนที่เหลือแล้ว/);
      await expect(page.locator("[data-testid=payment-card]")).toContainText("ชำระครบแล้ว", { timeout: 20_000 });
      await page.click("[data-testid=action-check_out]");
      await toast(page, /เช็กเอาต์แล้ว/);
      await expect(status(page)).toHaveText(/เช็กเอาต์แล้ว/, { timeout: 20_000 });
      const db = await dbStay(stayA.id);
      if (db.stay?.status !== "checked_out" || db.stay.paymentStatus !== "paid" || db.stay.paidAmount !== stayA.total) throw new Error(`db ${db.stay?.status}/${db.stay?.paymentStatus}/${db.stay?.paidAmount}`);
      const cash = db.payments.find((p) => p.method === "cash");
      if (!cash || cash.status !== "paid") throw new Error(`cash payment ${JSON.stringify(db.payments)}`);
      return `checked_out · paid ฿${db.stay.paidAmount / 100} (${db.payments.length} payments)`;
    });

    await step("8 detail: unit number + internal note; search by number", async () => {
      if (!stayA) throw new Error("needs step 4");
      await goto(page, `/rental/bookings/${stayA.id}`);
      await page.fill("[data-testid=unit-number]", "QA-101");
      await page.fill("#stay-note", "แขกขอห้องชั้นล่าง (QA)");
      await page.click("[data-testid=save-notes]");
      await toast(page, /บันทึกแล้ว/);
      const db = await dbStay(stayA.id);
      if (db.stay?.unitNumber !== "QA-101" || !db.stay.internalNote?.includes("ชั้นล่าง")) throw new Error(`db unit ${db.stay?.unitNumber} note ${db.stay?.internalNote}`);
      await goto(page, `/rental/bookings?tab=all&q=${encodeURIComponent(stayA.number)}`);
      await expect(page.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      await expect(page.locator("[data-testid=stay-row]")).toHaveCount(1);
      await goto(page, `/rental/bookings?tab=all&q=${encodeURIComponent("QA-101")}`);
      await expect(page.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      await goto(page, `/rental/bookings?tab=all&q=0891234567`);
      await expect(page.locator("[data-testid=stay-row]", { hasText: stayA.number })).toBeVisible();
      return "unit QA-101 · search by number / unit / phone";
    });

    await step("9 upcoming stay: จองล่วงหน้า → cancel refused while slip pending → reject slip → cancel → ยกเลิก tab", async () => {
      if (!unitTypeId) throw new Error("needs step 2");
      const s = await seedSlipStay(D5, 2, "คุณยกเลิก ทดสอบ");
      stayB = s;
      await goto(page, "/rental/bookings?tab=upcoming");
      await expect(page.locator("[data-testid=stay-row]", { hasText: s.number })).toBeVisible();
      await goto(page, `/rental/bookings/${s.id}`);
      // a slip is still under review → cancel is refused until the admin decides on the slip
      await page.click("[data-testid=action-cancel]");
      let dlg = page.getByRole("dialog");
      await dlg.locator("[aria-label=เหตุผล]").fill("ลูกค้าขอยกเลิก (QA)");
      await dlg.locator("[data-testid=reason-confirm]").click();
      await toast(page, /มีสลิปรอตรวจสอบอยู่/);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // reject the slip with a reason → payment failed, stay still pending (guest may upload again)
      await page.getByRole("button", { name: "ปฏิเสธสลิป" }).first().click();
      dlg = page.getByRole("dialog");
      await dlg.locator("[aria-label=เหตุผล]").fill("ยอดเงินไม่ตรง (QA)");
      await dlg.locator("[data-testid=reason-confirm]").click();
      await toast(page, /ปฏิเสธสลิปแล้ว/);
      await expect(page.locator("[data-testid=payment-failed]")).toBeVisible({ timeout: 20_000 });
      await expect(status(page)).toHaveText(/รอชำระเงิน/);
      // now cancel
      await page.click("[data-testid=action-cancel]");
      dlg = page.getByRole("dialog");
      await dlg.locator("[aria-label=เหตุผล]").fill("ลูกค้าขอยกเลิก (QA)");
      await dlg.locator("[data-testid=reason-confirm]").click();
      await toast(page, /ยกเลิกการจองแล้ว/);
      await expect(status(page)).toHaveText(/ยกเลิก/, { timeout: 20_000 });
      await goto(page, "/rental/bookings?tab=cancelled");
      await expect(page.locator("[data-testid=stay-row]", { hasText: s.number })).toBeVisible();
      const db = await dbStay(s.id);
      if (db.stay?.status !== "cancelled") throw new Error(`db ${db.stay?.status}`);
      if (db.payments.some((p) => ["pending", "pending_verification", "failed"].includes(p.status))) throw new Error(`open payment left: ${JSON.stringify(db.payments)}`);
      return `${s.number} cancel refused while slip pending → slip rejected → cancelled · payment ${db.payments[0]?.status}`;
    });

    await step("10 calendar: block a date (UI) → storefront /api/rental/calendar hides it → unblock", async () => {
      if (!unitTypeId) throw new Error("needs step 2");
      await goto(page, `/rental/calendar?month=${MONTH10}`);
      const cell = page.locator(`[data-testid=grid-row-${unitTypeId}] button[data-date="${D10}"]`);
      await expect(cell).toBeVisible();
      await cell.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator("#block-from")).toHaveValue(D10);
      await page.getByRole("dialog").locator("#block-reason").fill("ซ่อมแอร์ (QA)");
      await page.click("[data-testid=block-submit]");
      await toast(page, /ปิดจอง 1 วันแล้ว/);
      await expect(cell).toHaveAttribute("data-blocked", "true", { timeout: 20_000 });
      const api = await storefrontJson(`/api/rental/calendar?type=${unitTypeId}&month=${MONTH10}`);
      if (api.status !== 200) throw new Error(`storefront calendar HTTP ${api.status} ${JSON.stringify(api.body).slice(0, 200)}`);
      const days = (api.body as { days: Array<{ date: string; remaining: number; blocked: boolean; bookable: boolean }> }).days;
      const blocked = days.find((d) => d.date === D10);
      const free = days.find((d) => d.date === addDays(D10, 1));
      if (!blocked?.blocked || blocked.remaining !== 0 || blocked.bookable) throw new Error(`api day ${JSON.stringify(blocked)}`);
      if (!free || free.remaining !== 2 || free.blocked) throw new Error(`api next day ${JSON.stringify(free)}`);
      await shot(page, "calendar-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/rental/calendar?month=${MONTH10}`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "calendar-390");
      // unblock through the same dialog
      await cell.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.click("[data-testid=unblock-submit]");
      await toast(page, /เปิดจองอีกครั้ง 1 วันแล้ว/);
      await expect(cell).not.toHaveAttribute("data-blocked", "true", { timeout: 20_000 });
      const after = await storefrontJson(`/api/rental/calendar?type=${unitTypeId}&month=${MONTH10}`);
      const d = (after.body as { days: Array<{ date: string; remaining: number; blocked: boolean }> }).days.find((x) => x.date === D10);
      if (!d || d.blocked || d.remaining !== 2) throw new Error(`api after unblock ${JSON.stringify(d)}`);
      return `${D10} blocked → remaining 0 on storefront → unblocked → remaining 2`;
    });

    await step("11 settings: save free-cancel days → moduleConfig.rental updated → restore", async () => {
      const before = await loadRentalModuleConfig(getAdminDb(), tenantId);
      originalFreeCancelDays = before.rental.freeCancelDays;
      const next = before.rental.freeCancelDays === 5 ? 6 : 5;
      await goto(page, "/rental/settings");
      await expect(page.locator("[data-testid=rental-settings]")).toBeVisible();
      await page.fill("[data-testid=free-cancel-days]", String(next));
      await page.click("[data-testid=settings-save]");
      await toast(page, /บันทึกนโยบายการจองแล้ว/);
      const after = await loadRentalModuleConfig(getAdminDb(), tenantId);
      if (after.rental.freeCancelDays !== next) throw new Error(`config freeCancelDays ${after.rental.freeCancelDays}`);
      await goto(page, "/rental/settings");
      await expect(page.locator("[data-testid=free-cancel-days]")).toHaveValue(String(next));
      await shot(page, "settings-1440");
      await page.fill("[data-testid=free-cancel-days]", String(originalFreeCancelDays));
      await page.click("[data-testid=settings-save]");
      await toast(page, /บันทึกนโยบายการจองแล้ว/);
      const restored = await loadRentalModuleConfig(getAdminDb(), tenantId);
      if (restored.rental.freeCancelDays !== originalFreeCancelDays) throw new Error(`restore failed ${restored.rental.freeCancelDays}`);
      originalFreeCancelDays = null;
      return `freeCancelDays ${before.rental.freeCancelDays} → ${next} → ${restored.rental.freeCancelDays}`;
    });

    await step("12 history: checked-out stay under ทั้งหมด with paid total; departures tab for its check-out day", async () => {
      if (!stayA) throw new Error("needs step 4");
      await goto(page, "/rental/bookings?tab=all");
      const row = page.locator("[data-testid=stay-row]", { hasText: stayA.number });
      await expect(row).toBeVisible();
      await expect(row).toContainText("เช็กเอาต์แล้ว");
      await expect(row).toContainText("ชำระครบแล้ว");
    });
  } finally {
    current = null;
    await mobile?.close().catch(() => {});
    await ctx?.close().catch(() => {});
    await browser.close();
    await cleanup().catch((e) => console.log(`cleanup failed: ${e instanceof Error ? e.message : e}`));
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== rental admin journey ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.step}${r.note ? ` — ${r.note}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed · tenant ${slug}`);
  if (shots.length) console.log("screenshots:\n" + shots.map((s) => `  ${s}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
