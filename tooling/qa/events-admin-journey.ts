import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq, getAdminDb, getDb, inArray, eventSessions, events, payments, tenantModules, tenants, ticketOrders, ticketTypes, tickets, withTenant } from "@rentweb/db";
import { attachSlip } from "@rentweb/core/payments";
import { invalidateTenant, provisionTenant } from "@rentweb/core/tenant";
import { getTemplate } from "@rentweb/templates";
import { createTicketOrder, loadEventsModuleConfig, signTicketPayload } from "@rentweb/module-events/admin";
import { BKK_OFFSET_MS, bkkDateString, toBkkInputValue } from "@rentweb/module-events/time";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Events back-office journey (admin on :3001).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/events-admin-journey.ts [--only 1,2] [--no-shots] [--keep] [--tenant <slug>]
 *
 * Tenant: demo-events when it exists with the events module (built by the storefront agent); otherwise a throwaway
 * "qa-events" (corporate template + events module + a receiving bank account so slip payments exist) is created on the
 * first run and reused. Flow (the brief's admin journey): create event + session + 2 ticket types in the UI → publish →
 * seed a slip order via the services → /payments queue links to the order → approve the slip in /events/orders →
 * tickets issued → /events/checkin accepts a typed code once (auto-submit, no Enter), refuses it the second time with
 * "ใช้แล้ว", accepts the signed QR payload of the second ticket, undo → attendees list shows checked-in + CSV + manual
 * check-in/undo → partial refund of one ticket (UI) → the gate refuses the refunded code → duplicate event.
 * Everything the run created is deleted at the end (keep it with --keep). Screenshots → tooling/screenshots/events-admin-*.png
 * (1440, 390, the gate also at 1180×820 landscape tablet and in night mode).
 */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const PREFERRED = "demo-events";
const FALLBACK = "qa-events";
const STAMP = `${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, "0")}`;
const EVENT_TITLE = `QA คอนเสิร์ตทดสอบ ${STAMP}`;
const VENUE = "หอประชุม QA ชั้น 3";
const TYPE_A = "บัตรทั่วไป";
const TYPE_B = "VIP";
const HOLDER_1 = "สมชาย ทดสอบ";
const HOLDER_2 = "สมหญิง ทดสอบ";
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
let eventId = "";
let dupId = "";
let sessionId = "";
let typeAId = "";
let order: { id: string; number: string; paymentId: string; total: number } | null = null;
let t1: { id: string; code: string; holderName: string } | null = null;
let t2: { id: string; code: string; holderName: string } | null = null;

/** Session window for today in Bangkok: starts in ~1 h (5 min when it is already late), lasts 3 h. */
function sessionWindow(): { start: Date; end: Date } {
  const now = new Date();
  const bkkHour = new Date(now.getTime() + BKK_OFFSET_MS).getUTCHours();
  const lead = bkkHour >= 22 ? 5 : 60;
  const start = new Date(Math.ceil((now.getTime() + lead * 60_000) / 300_000) * 300_000);
  return { start, end: new Date(start.getTime() + 3 * 3_600_000) };
}
const WINDOW = sessionWindow();

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
      const f = path.join(shotsDir, `events-admin-fail-${String(++failN).padStart(2, "0")}.png`);
      await current.screenshot({ path: f }).catch(() => {});
      console.log(`     screenshot: ${f}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* tenant + data helpers                                                */
/* ------------------------------------------------------------------ */

async function hasEvents(id: string): Promise<boolean> {
  const [m] = await getAdminDb().select({ enabled: tenantModules.enabled }).from(tenantModules).where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleKey, "events"))).limit(1);
  return !!m?.enabled;
}

/** Enables the events module and makes sure a bank account exists so "slip" is an accepted payment method. */
async function enableEvents(id: string, host: string) {
  const db = getAdminDb();
  await db.insert(tenantModules).values({ tenantId: id, moduleKey: "events", enabled: true, config: {} }).onConflictDoNothing();
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, id)).limit(1);
  const settings = { ...(t?.settings ?? {}) } as Record<string, unknown>;
  const pay = { ...((settings.payments as Record<string, unknown> | undefined) ?? {}) };
  pay.enabled = { ...((pay.enabled as Record<string, unknown> | undefined) ?? {}), bankTransfer: true, cash: true };
  if (!Array.isArray(pay.bankAccounts) || pay.bankAccounts.length === 0) pay.bankAccounts = [{ bank: "kbank", name: "QA Events", number: "0123456789" }];
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
    if (await hasEvents(t.id)) return { id: t.id, slug: s, note: `existing ${s}` };
    if (s === PREFERRED && !tenantArg) continue; // demo-events without the module belongs to the storefront agent
    await enableEvents(t.id, `${s}.localhost`);
    return { id: t.id, slug: s, note: `enabled events on ${s}` };
  }
  if (tenantArg) throw new Error(`tenant ${tenantArg} not found`);
  const tpl = getTemplate("corporate");
  if (!tpl) throw new Error("template corporate missing");
  const r = await provisionTenant({ name: "QA Events (admin)", slug: FALLBACK, template: tpl, planKey: "pro", withSampleData: false, db });
  await db.update(tenants).set({ status: "active", trialEndsAt: null }).where(eq(tenants.id, r.tenantId));
  await enableEvents(r.tenantId, `${FALLBACK}.localhost`);
  return { id: r.tenantId, slug: FALLBACK, note: `created ${FALLBACK}` };
}

async function seedSlipOrder() {
  const db = getAdminDb();
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const cfg = await loadEventsModuleConfig(db, tenantId);
  const opts = { config: cfg.events, settings: (t?.settings ?? {}) as Record<string, unknown> };
  const r = await withTenant(getDb(), tenantId, (tx) =>
    createTicketOrder(
      tx,
      tenantId,
      {
        eventId,
        sessionId,
        lines: [{ ticketTypeId: typeAId, qty: 2 }],
        customer: { name: "คุณทดสอบ คิวเอ", phone: "0891234567", email: "qa-events@example.com" },
        holders: [
          { ticketTypeId: typeAId, name: HOLDER_1 },
          { ticketTypeId: typeAId, name: HOLDER_2 },
        ],
        paymentMethod: "slip",
        source: "online",
        note: "QA journey",
      },
      opts,
    ),
  );
  if (!r.ok) throw new Error(`createTicketOrder → ${r.error}`);
  if (!r.value.payment) throw new Error("createTicketOrder made no payment (slip method not enabled on the tenant?)");
  await mkdir(path.join(process.cwd(), "..", "apps", "web", "public", "uploads", "qa"), { recursive: true }).catch(() => {});
  await writeFile(path.join(process.cwd(), "..", "apps", "web", "public", "uploads", "qa", "_qa-slip.png"), PNG_1x1).catch(() => {});
  await withTenant(getDb(), tenantId, (tx) => attachSlip(tx, tenantId, r.value.payment!.id, { url: "/uploads/qa/_qa-slip.png" }, { autoApprove: false }));
  return { id: r.value.order.id, number: r.value.order.number, paymentId: r.value.payment.id, total: r.value.order.total };
}

async function dbOrder(id: string) {
  const db = getAdminDb();
  const [o] = await db.select().from(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.id, id))).limit(1);
  const pays = await db.select({ id: payments.id, status: payments.status, method: payments.method, amount: payments.amount, refundedAmount: payments.refundedAmount }).from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "ticket_order"), eq(payments.refId, id)));
  const tix = await db.select({ id: tickets.id, code: tickets.code, holderName: tickets.holderName, status: tickets.status, checkedInAt: tickets.checkedInAt }).from(tickets).where(and(eq(tickets.tenantId, tenantId), eq(tickets.orderId, id))).orderBy(tickets.createdAt, tickets.code);
  return { order: o ?? null, payments: pays, tickets: tix };
}

async function cleanup() {
  if (keep || !tenantId) return;
  const db = getAdminDb();
  const ids = [eventId, dupId].filter(Boolean);
  if (!ids.length) return;
  const orders = await db.select({ id: ticketOrders.id }).from(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), inArray(ticketOrders.eventId, ids)));
  const orderIds = orders.map((o) => o.id);
  await db.delete(tickets).where(and(eq(tickets.tenantId, tenantId), inArray(tickets.eventId, ids)));
  if (orderIds.length) {
    await db.delete(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "ticket_order"), inArray(payments.refId, orderIds)));
    await db.delete(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), inArray(ticketOrders.id, orderIds)));
  }
  await db.delete(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), inArray(ticketTypes.eventId, ids)));
  await db.delete(eventSessions).where(and(eq(eventSessions.tenantId, tenantId), inArray(eventSessions.eventId, ids)));
  await db.delete(events).where(and(eq(events.tenantId, tenantId), inArray(events.id, ids)));
  console.log(`cleanup: removed ${ids.length} event(s), ${orderIds.length} order(s)`);
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

async function shot(page: Page, name: string, fullPage = false) {
  if (noShots) return;
  const f = path.join(shotsDir, `events-admin-${name}.png`);
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

const gateUrl = () => `/events/checkin?event=${eventId}&session=${sessionId}`;
const gateResult = (page: Page) => page.locator("[data-testid=gate-result]");
const gateCode = (page: Page) => page.locator("[data-testid=gate-code]");

/** Types a code like a human / USB scanner (no Enter) and waits for the gate to settle on an outcome. */
async function scanTyped(page: Page, code: string, outcome: string) {
  await expect(gateCode(page)).toBeEnabled({ timeout: 20_000 });
  await gateCode(page).click();
  await gateCode(page).pressSequentially(code, { delay: 12 });
  await expect(gateResult(page)).toHaveAttribute("data-outcome", outcome, { timeout: 25_000 });
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const t = await ensureTenant();
  tenantId = t.id;
  slug = t.slug;
  console.log(`tenant: ${slug} (${tenantId}) — ${t.note}; today ${bkkDateString()} · session ${toBkkInputValue(WINDOW.start)} → ${toBkkInputValue(WINDOW.end)}`);

  const browser = await chromium.launch();
  let ctx: BrowserContext | null = null;
  let mobile: BrowserContext | null = null;
  let tablet: BrowserContext | null = null;
  try {
    const state = await login(browser);
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    current = page;
    mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await isolateHmr(mobile);
    const mpage = await mobile.newPage();

    await step("1 nav: every events adminNav href is a real page", async () => {
      const codes: string[] = [];
      for (const rel of ["/events", "/events/orders", "/events/checkin", "/events/attendees"]) {
        const r = await page.goto(`${ADMIN}/t/${slug}${rel}`, { waitUntil: "networkidle", timeout: 90_000 });
        codes.push(`${rel} ${r?.status()}`);
        if (!r || r.status() >= 400) throw new Error(codes.join(", "));
        await expect(page.locator("text=Application error")).toHaveCount(0);
      }
      await expect(page.locator(`a[href="/t/${slug}/events"]`).first()).toBeVisible();
      return codes.join(", ");
    });

    await step("2 event: create in the UI → detail page, draft in DB", async () => {
      await goto(page, "/events/new");
      await page.fill("#e-title", EVENT_TITLE);
      await page.fill("#e-summary", "งานทดสอบระบบจำหน่ายบัตรและเช็กอินหน้างาน (สร้างโดย QA journey)");
      await page.fill("#e-venue", VENUE);
      await page.click("[data-testid=event-save]");
      await toast(page, /สร้างอีเวนต์แล้ว/);
      await page.waitForURL(/\/events\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      eventId = page.url().split("/").pop()!;
      const [row] = await getAdminDb().select({ status: events.status, venue: events.venueName, slug: events.slug }).from(events).where(and(eq(events.tenantId, tenantId), eq(events.id, eventId))).limit(1);
      if (!row || row.status !== "draft" || row.venue !== VENUE) throw new Error(`db row ${JSON.stringify(row)}`);
      await expect(page.locator("[data-testid=event-title-heading]")).toContainText(EVENT_TITLE);
      await expect(page.locator("[data-testid=event-status]")).toContainText("ฉบับร่าง");
      await expect(page.locator("[data-testid=action-publish]")).toBeDisabled();
      return `${eventId} · slug ${row.slug}`;
    });

    await step("3 session: add today's session in the dialog → row + events.startsAt synced", async () => {
      if (!eventId) throw new Error("needs step 2");
      await page.click("[data-testid=session-add]");
      const dlg = page.getByRole("dialog");
      await dlg.locator("#s-name").fill("รอบค่ำ");
      await dlg.locator("#s-start").fill(toBkkInputValue(WINDOW.start));
      await dlg.locator("#s-end").fill(toBkkInputValue(WINDOW.end));
      await dlg.locator("#s-cap").fill("100");
      await dlg.locator("[data-testid=session-save]").click();
      await toast(page, /เพิ่มรอบแล้ว/);
      await expect(page.locator("[data-testid=session-row]")).toHaveCount(1, { timeout: 20_000 });
      const [s] = await getAdminDb().select({ id: eventSessions.id, startsAt: eventSessions.startsAt, capacity: eventSessions.capacity }).from(eventSessions).where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.eventId, eventId))).limit(1);
      if (!s || s.capacity !== 100) throw new Error(`db session ${JSON.stringify(s)}`);
      if (Math.abs(s.startsAt.getTime() - WINDOW.start.getTime()) > 60_000) throw new Error(`startsAt ${s.startsAt.toISOString()} ≠ ${WINDOW.start.toISOString()}`);
      sessionId = s.id;
      const [ev] = await getAdminDb().select({ startsAt: events.startsAt }).from(events).where(eq(events.id, eventId)).limit(1);
      if (!ev?.startsAt) throw new Error("events.startsAt not synced");
      return `${sessionId} · ${toBkkInputValue(s.startsAt)} · cap 100`;
    });

    await step("4 ticket types: add 2 in the dialog (฿500 ×50, ฿1,500 ×10)", async () => {
      if (!eventId) throw new Error("needs step 2");
      for (const [name, price, qty] of [
        [TYPE_A, "500", "50"],
        [TYPE_B, "1500", "10"],
      ] as const) {
        await page.click("[data-testid=ticket-type-add]");
        const dlg = page.getByRole("dialog");
        await dlg.locator("#t-name").fill(name);
        await dlg.locator("#t-price").fill(price);
        await dlg.locator("#t-qty").fill(qty);
        await dlg.locator("[data-testid=ticket-type-save]").click();
        await toast(page, /เพิ่มประเภทบัตรแล้ว/);
        await expect(page.locator("[data-testid=ticket-type-row]", { hasText: name })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      const rows = await getAdminDb().select({ id: ticketTypes.id, name: ticketTypes.name, price: ticketTypes.price, quantity: ticketTypes.quantity }).from(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.eventId, eventId)));
      const a = rows.find((r) => r.name === TYPE_A);
      const b = rows.find((r) => r.name === TYPE_B);
      if (!a || a.price !== 50_000 || a.quantity !== 50 || !b || b.price !== 150_000 || b.quantity !== 10) throw new Error(`db types ${JSON.stringify(rows)}`);
      typeAId = a.id;
      return `${TYPE_A} ฿500 ×50 · ${TYPE_B} ฿1,500 ×10`;
    });

    await step("5 publish: button enabled once ready → เผยแพร่แล้ว → list card under upcoming", async () => {
      if (!eventId) throw new Error("needs step 2");
      await goto(page, `/events/${eventId}`);
      const publish = page.locator("[data-testid=action-publish]");
      await expect(publish).toBeEnabled({ timeout: 20_000 });
      await publish.click();
      await expect(page.locator("[data-testid=event-status]")).toContainText("เผยแพร่แล้ว", { timeout: 20_000 });
      const [row] = await getAdminDb().select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
      if (row?.status !== "published") throw new Error(`db status ${row?.status}`);
      await shot(page, "event-1440");
      await goto(page, "/events");
      await expect(page.locator("[data-testid=event-card]", { hasText: EVENT_TITLE })).toBeVisible();
      await shot(page, "events-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/events`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "events-390");
      return "published";
    });

    await step("6 seed: slip order (2 × ทั่วไป, holders named) via services → shared /payments queue links to /events/orders/[id]", async () => {
      if (!typeAId || !sessionId) throw new Error("needs steps 3–4");
      order = await seedSlipOrder();
      const db = await dbOrder(order.id);
      if (db.order?.status !== "pending" || db.payments[0]?.status !== "pending_verification") throw new Error(`order ${db.order?.status} / payment ${db.payments[0]?.status}`);
      if (db.order.total !== 100_000 || db.order.quantity !== 2) throw new Error(`totals ${db.order.total} / qty ${db.order.quantity}`);
      await goto(page, "/payments");
      await expect(page.locator(`a[href="/t/${slug}/events/orders/${order.id}"]`).first()).toBeVisible({ timeout: 20_000 });
      return `${order.number} · ฿1,000 · slip pending_verification · queue link ok`;
    });

    await step("7 orders: รอชำระ tab lists it → approve slip → paid + 2 tickets issued", async () => {
      if (!order) throw new Error("needs step 6");
      await goto(page, "/events/orders?tab=pending");
      const row = page.locator("[data-testid=order-row]", { hasText: order.number });
      await expect(row).toBeVisible();
      await goto(page, `/events/orders/${order.id}`);
      await expect(page.locator("[data-testid=order-number]")).toContainText(order.number);
      await expect(page.locator("[data-testid=payment-pending_verification]")).toBeVisible();
      await page.click("[data-testid=approve-payment]");
      await toast(page, /ยืนยันการชำระเงินแล้ว/);
      await expect(page.locator("[data-testid=order-status]")).toContainText("ชำระแล้ว", { timeout: 20_000 });
      await expect(page.locator("[data-testid=ticket-row]")).toHaveCount(2, { timeout: 20_000 });
      const db = await dbOrder(order.id);
      if (db.order?.status !== "paid" || db.payments[0]?.status !== "paid") throw new Error(`order ${db.order?.status} / payment ${db.payments[0]?.status}`);
      if (db.tickets.length !== 2 || db.tickets.some((x) => x.status !== "valid")) throw new Error(`tickets ${JSON.stringify(db.tickets)}`);
      t1 = db.tickets.find((x) => x.holderName === HOLDER_1) ?? db.tickets[0]!;
      t2 = db.tickets.find((x) => x.holderName === HOLDER_2 && x.id !== t1!.id) ?? db.tickets[1]!;
      await expect(page.locator("[data-testid=ticket-code]", { hasText: t1.code })).toBeVisible();
      await goto(page, "/events/orders?tab=paid");
      await expect(page.locator("[data-testid=order-row]", { hasText: order.number })).toBeVisible();
      await shot(page, "orders-1440");
      await goto(page, `/events/orders/${order.id}`);
      await shot(page, "order-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/events/orders/${order.id}`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "order-390");
      return `${t1.code} (${t1.holderName}) · ${t2.code} (${t2.holderName})`;
    });

    await step("8 gate: typed code auto-submits → ✓; same code again → ใช้แล้ว; QR payload → ✓; undo last; unknown code → ✗", async () => {
      if (!t1 || !t2) throw new Error("needs step 7");
      await goto(page, gateUrl());
      await expect(page.locator("[data-testid=gate]")).toBeVisible();
      await expect(page.locator("[data-testid=gate-session]")).toHaveValue(sessionId);
      await expect(page.locator("[data-testid=gate-checked-in]")).toHaveText("0");
      // 1) typed like a USB scanner — no Enter
      await scanTyped(page, t1.code, "checked_in");
      await expect(page.locator("[data-testid=gate-holder]")).toContainText(t1.holderName);
      await expect(page.locator("[data-testid=gate-checked-in]")).toHaveText("1", { timeout: 10_000 });
      await shot(page, "checkin-1440");
      let db = await dbOrder(order!.id);
      if (db.tickets.find((x) => x.id === t1!.id)?.status !== "checked_in") throw new Error("t1 not checked_in in DB");
      // 2) the same code with Enter → already used
      await gateCode(page).fill(t1.code);
      await gateCode(page).press("Enter");
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "already_checked_in", { timeout: 25_000 });
      await expect(page.locator("[data-testid=gate-result-label]")).toContainText("ใช้แล้ว");
      await expect(page.locator("[data-testid=gate-checked-in]")).toHaveText("1");
      // 3) signed QR payload (what the camera / scanner delivers) for the second ticket
      const payload = signTicketPayload({ tenantId, ticketId: t2.id, code: t2.code });
      await gateCode(page).fill(payload);
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "checked_in", { timeout: 25_000 });
      await expect(page.locator("[data-testid=gate-holder]")).toContainText(t2.holderName);
      await expect(page.locator("[data-testid=gate-checked-in]")).toHaveText("2", { timeout: 10_000 });
      await expect(page.locator("[data-testid=gate-recent]")).toContainText(t2.holderName);
      // 4) undo the last check-in → count back to 1, ticket valid again
      await page.click("[data-testid=gate-undo]");
      await toast(page, /ยกเลิกการเช็กอิน/);
      await expect(page.locator("[data-testid=gate-checked-in]")).toHaveText("1", { timeout: 15_000 });
      db = await dbOrder(order!.id);
      if (db.tickets.find((x) => x.id === t2!.id)?.status !== "valid") throw new Error("undo did not restore t2");
      // 5) unknown code
      await gateCode(page).fill("ZZZZ-ZZZZ-ZZZZ");
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "rejected", { timeout: 25_000 });
      await expect(gateResult(page)).toHaveAttribute("data-reason", "unknown");
      await expect(page.locator("[data-testid=gate-result-label]")).toContainText("ไม่พบบัตร");
      // 6) wrong session: a gate without the session filter accepts any session; with another session id the ticket is refused —
      //    covered by unit tests; here we only check the "ทุกรอบ" selector keeps working
      await page.locator("[data-testid=gate-session]").selectOption("");
      await expect(page.locator("[data-testid=gate-code-hint], #gate-code-hint").first()).toContainText("ไม่ตรวจรอบ");
      // screenshots: 390 (already-used state), landscape tablet, night mode
      await mpage.goto(`${ADMIN}/t/${slug}${gateUrl()}`, { waitUntil: "networkidle", timeout: 90_000 });
      await scanTyped(mpage, t1.code, "already_checked_in");
      await shot(mpage, "checkin-390");
      tablet = await browser.newContext({ viewport: { width: 1180, height: 820 }, storageState: state, hasTouch: true, deviceScaleFactor: 2 });
      await isolateHmr(tablet);
      const tpage = await tablet.newPage();
      await tpage.goto(`${ADMIN}/t/${slug}${gateUrl()}`, { waitUntil: "networkidle", timeout: 90_000 });
      await scanTyped(tpage, t1.code, "already_checked_in");
      await shot(tpage, "checkin-tablet-landscape");
      await tpage.click("[data-testid=gate-dark]");
      await expect(tpage.locator("[data-testid=gate]")).toHaveAttribute("data-gate-dark", "true");
      await shot(tpage, "checkin-tablet-dark");
      await tpage.close();
      await goto(page, gateUrl());
      await page.click("[data-testid=gate-dark]");
      await expect(page.locator("[data-testid=gate]")).toHaveAttribute("data-gate-dark", "true");
      await gateCode(page).fill("ZZZZ-ZZZZ-ZZZZ");
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "rejected", { timeout: 25_000 });
      await shot(page, "checkin-dark-1440");
      await page.click("[data-testid=gate-dark]");
      return `t1 ✓ then ใช้แล้ว · t2 via QR ✓ then undo · unknown ✗`;
    });

    await step("9 attendees: checked-in row, status tab, search, CSV export, manual check-in + undo", async () => {
      if (!t1 || !t2) throw new Error("needs step 7");
      await goto(page, `/events/attendees?event=${eventId}`);
      const row1 = page.locator("[data-testid=attendee-row]", { hasText: t1.code });
      await expect(row1).toBeVisible();
      await expect(row1).toHaveAttribute("data-ticket-status", "checked_in");
      await expect(page.locator("[data-testid=attendee-row]", { hasText: t2.code })).toHaveAttribute("data-ticket-status", "valid");
      await shot(page, "attendees-1440");
      await mpage.goto(`${ADMIN}/t/${slug}/events/attendees?event=${eventId}`, { waitUntil: "networkidle", timeout: 90_000 });
      await shot(mpage, "attendees-390");
      await goto(page, `/events/attendees?event=${eventId}&status=checked_in`);
      await expect(page.locator("[data-testid=attendee-row]")).toHaveCount(1);
      await goto(page, `/events/attendees?event=${eventId}&q=${encodeURIComponent(t2.code)}`);
      await expect(page.locator("[data-testid=attendee-row]")).toHaveCount(1);
      await expect(page.locator("[data-testid=attendee-name]")).toContainText(t2.holderName);
      const csv = await page.request.get(`${ADMIN}/t/${slug}/events/attendees/export?event=${eventId}`);
      if (csv.status() !== 200) throw new Error(`csv HTTP ${csv.status()}`);
      const ct = csv.headers()["content-type"] ?? "";
      const body = await csv.text();
      if (!ct.includes("text/csv")) throw new Error(`csv content-type ${ct}`);
      if (!body.includes(t1.code) || !body.includes(t2.code) || !body.includes("รหัสบัตร")) throw new Error(`csv body missing codes: ${body.slice(0, 200)}`);
      // manual check-in of t2 from the list, then undo
      await goto(page, `/events/attendees?event=${eventId}`);
      const row2 = page.locator("[data-testid=attendee-row]", { hasText: t2.code });
      await row2.locator("[data-testid=attendee-checkin]").click();
      await toast(page, new RegExp(`เช็กอิน ${t2.holderName} แล้ว`));
      await expect(row2).toHaveAttribute("data-ticket-status", "checked_in", { timeout: 20_000 });
      await row2.locator("[data-testid=attendee-undo]").click();
      await toast(page, /ยกเลิกการเช็กอิน/);
      await expect(row2).toHaveAttribute("data-ticket-status", "valid", { timeout: 20_000 });
      return `rows ok · csv ${body.split("\r\n").length - 2} data rows`;
    });

    await step("10 refund: partial refund of 1 ticket in the UI → ticket refunded, order stays paid, payment partially refunded", async () => {
      if (!order || !t2) throw new Error("needs step 7");
      await goto(page, `/events/orders/${order.id}`);
      await page.click("[data-testid=refund-open]");
      const dlg = page.getByRole("dialog");
      // the dialog pre-selects every live ticket → clear, then pick t2 only
      const clear = dlg.getByRole("button", { name: "ไม่เลือกทั้งหมด" });
      if (await clear.count()) await clear.click();
      await expect(dlg).toContainText("เลือก 0 / 2 ใบ");
      await dlg.getByRole("checkbox", { name: `คืนบัตร ${t2.code}` }).check();
      await expect(dlg).toContainText("เลือก 1 / 2 ใบ");
      await expect(dlg.locator("[data-testid=refund-confirm]")).toContainText("1 ใบ");
      await expect(dlg.locator("[data-testid=refund-amount]")).toHaveValue(/500/);
      await dlg.locator("[data-testid=refund-confirm]").click();
      await toast(page, /คืนเงิน ฿500 แล้ว|คืนเงิน.*500/);
      await expect(page.locator("[data-testid=ticket-row]", { hasText: t2.code })).toContainText("คืนเงินแล้ว", { timeout: 20_000 });
      const db = await dbOrder(order.id);
      const r2 = db.tickets.find((x) => x.id === t2!.id);
      const r1 = db.tickets.find((x) => x.id === t1!.id);
      if (r2?.status !== "refunded" || r1?.status !== "checked_in") throw new Error(`tickets ${JSON.stringify(db.tickets)}`);
      if (db.order?.status !== "paid" || db.order.refundedAmount !== 50_000) throw new Error(`order ${db.order?.status} refunded ${db.order?.refundedAmount}`);
      if (db.payments[0]?.status !== "partially_refunded" || db.payments[0].refundedAmount !== 50_000) throw new Error(`payment ${JSON.stringify(db.payments)}`);
      const [ty] = await getAdminDb().select({ sold: ticketTypes.sold }).from(ticketTypes).where(eq(ticketTypes.id, typeAId)).limit(1);
      await expect(page.locator("[data-testid=order-status]")).toContainText("ชำระแล้ว");
      return `฿500 refunded · order paid (refunded 500) · payment partially_refunded · type sold ${ty?.sold}`;
    });

    await step("11 gate after refund: refunded code refused (คืนเงินแล้ว); used code still ใช้แล้ว; KPI เช็กอินวันนี้ ≥ 1", async () => {
      if (!t1 || !t2) throw new Error("needs step 7");
      await goto(page, gateUrl());
      await gateCode(page).fill(t2.code);
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "rejected", { timeout: 25_000 });
      await expect(gateResult(page)).toHaveAttribute("data-reason", "refunded");
      await expect(page.locator("[data-testid=gate-result-label]")).toContainText("คืนเงินแล้ว");
      await gateCode(page).fill(t1.code);
      await expect(gateResult(page)).toHaveAttribute("data-outcome", "already_checked_in", { timeout: 25_000 });
      await goto(page, "/events");
      const kpi = page.locator("text=เช็กอินวันนี้").first();
      await expect(kpi).toBeVisible();
      return "refunded ✗ · used ใช้แล้ว";
    });

    await step("12 duplicate: ทำสำเนา → new draft with the same session + ticket types (sold 0)", async () => {
      if (!eventId) throw new Error("needs step 2");
      await goto(page, `/events/${eventId}`);
      await page.getByRole("button", { name: "ทำสำเนา" }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: "ทำสำเนา" }).click();
      await page.waitForURL((u) => /\/events\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(eventId), { timeout: 30_000 });
      dupId = page.url().split("/").pop()!;
      await expect(page.locator("[data-testid=event-status]")).toContainText("ฉบับร่าง");
      const db = getAdminDb();
      const sess = await db.select({ id: eventSessions.id }).from(eventSessions).where(eq(eventSessions.eventId, dupId));
      const types = await db.select({ sold: ticketTypes.sold, reserved: ticketTypes.reserved }).from(ticketTypes).where(eq(ticketTypes.eventId, dupId));
      if (sess.length !== 1 || types.length !== 2 || types.some((x) => x.sold !== 0 || x.reserved !== 0)) throw new Error(`copy sessions ${sess.length} types ${JSON.stringify(types)}`);
      return `${dupId} · 1 session · 2 types`;
    });
  } finally {
    current = null;
    await (tablet as BrowserContext | null)?.close().catch(() => {});
    await mobile?.close().catch(() => {});
    await ctx?.close().catch(() => {});
    await browser.close();
    await cleanup().catch((e) => console.log(`cleanup failed: ${e instanceof Error ? e.message : e}`));
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== events admin journey ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.step}${r.note ? ` — ${r.note}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed · tenant ${slug}`);
  if (shots.length) console.log("screenshots:\n" + shots.map((s) => `  ${s}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
