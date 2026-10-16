import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, eq, ne, getAdminDb, tenants, diningTables, tableSessions, restaurantOrders, payments, menuItems, reservations } from "@rentweb/db";

/**
 * Restaurant back-office journey (admin on :3001 + storefront on demo-restaurant.localhost:3000).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/restaurant-admin-journey.ts
 * Creates one dine-in order (on a free table), one pickup order and one reservation on the demo tenant,
 * then drives the board / KDS / tables / menu / reservations pages. Screenshots → tooling/screenshots/restaurant-admin-*.png
 */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const STORE = "http://demo-restaurant.localhost:3000";
const SLUG = "demo-restaurant";
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const PHONE = "0812345678";
const SOLD_OUT_ITEM = "แกงจืดเต้าหู้หมูสับ";
const RES_NAME = `คิวเอ จองโต๊ะ ${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, "0")}`;

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
const shotsDir = path.resolve(process.cwd(), "screenshots");
let current: Page | null = null;
let shotN = 0;

/** `--only 9` runs just the steps whose name starts with one of the given prefixes (9 / 9b have no dependency on earlier steps). */
const only = process.argv.slice(2).flatMap((a, i, arr) => (a === "--only" && arr[i + 1] ? arr[i + 1]!.split(",") : []));

async function step(name: string, fn: () => Promise<string | void>) {
  if (only.length && !only.some((p) => name.startsWith(p))) return;
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
      const f = path.join(shotsDir, `restaurant-admin-fail-${String(++shotN).padStart(2, "0")}.png`);
      await current.screenshot({ path: f, fullPage: false }).catch(() => {});
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

async function storeCtx(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", hasTouch: true, isMobile: true, locale: "th-TH" });
  const page = await ctx.newPage();
  current = page;
  return { ctx, page };
}

const cartBar = (page: Page) => page.locator("[data-rw-cartbar] button");
const toast = (page: Page, re: RegExp) => expect(page.locator("[data-sonner-toast]").filter({ hasText: re }).first()).toBeVisible({ timeout: 15_000 });
const ymdBangkok = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function shot(page: Page, name: string) {
  const f = path.join(shotsDir, `restaurant-admin-${name}.png`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: f, animations: "disabled" });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize()?.width ?? 0;
  console.log(`  shot ${f}${scrollW > vw ? `  ⚠ horizontal overflow ${scrollW}px > ${vw}px` : ""}`);
  return f;
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const db = getAdminDb();
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  if (!tenant) throw new Error("demo-restaurant tenant not found");
  const tenantId = tenant.id;

  // pick a table with no open session so the dine-in flow starts clean
  const tables = await db.select({ id: diningTables.id, name: diningTables.name, qrToken: diningTables.qrToken }).from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.active, true))).orderBy(asc(diningTables.sort));
  const busy = new Set((await db.select({ tableId: tableSessions.tableId }).from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), ne(tableSessions.status, "closed")))).map((s) => s.tableId));
  const table = [...tables].reverse().find((t) => !busy.has(t.id)) ?? tables[tables.length - 1];
  if (!table) throw new Error("no dining tables");
  console.log(`table ${table.name} (${table.qrToken})`);

  const browser = await chromium.launch();
  const shared: { dineIn?: string; pickup?: string; pickupPaymentId?: string; webReservation?: string } = {};
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await login(browser) });
  const a = await admin.newPage();
  const adminErrors: string[] = [];
  a.on("response", (r) => { if (r.status() >= 500) adminErrors.push(`${r.status()} ${r.url().slice(0, 140)}`); });
  a.on("console", (m) => { if (m.type() === "error") adminErrors.push(m.text().slice(0, 200)); });
  const base = `${ADMIN}/t/${SLUG}/restaurant`;

  /* ───────── storefront: dine-in + pickup ───────── */
  {
    const { ctx, page } = await storeCtx(browser);
    await step("1 storefront: dine-in order from /t/<qrToken>", async () => {
      await page.goto(`${STORE}/t/${table.qrToken}`, { waitUntil: "networkidle", timeout: 60_000 });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`โต๊ะ ${table.name}`);
      await page.getByRole("button", { name: /ผัดกะเพราเนื้อโคขุน/ }).click();
      let dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: /เผ็ดมาก/ }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await page.getByRole("button", { name: /ชาไทยเย็น/ }).click();
      dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: "หวานน้อย" }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await cartBar(page).click();
      dlg = page.getByRole("dialog");
      await dlg.locator("#guest-name").fill("คิวเอ แอดมิน");
      await dlg.getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
      await expect(dlg.getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20_000 });
      const number = (await dlg.textContent())?.match(/R-\d{4,}/)?.[0];
      if (!number) throw new Error("no R- number in confirmation");
      shared.dineIn = number;
      return `${number} on โต๊ะ ${table.name}`;
    });
    await step("1b storefront: pickup order (PromptPay, slip not uploaded)", async () => {
      await page.goto(`${STORE}/order`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.getByRole("button", { name: /หมูสะเต๊ะสูตรคุณยาย/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await cartBar(page).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: /ดำเนินการต่อ/ }).click();
      const slots = dlg.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio");
      await expect(slots.first()).toBeVisible();
      await ((await slots.count()) > 1 ? slots.nth(1) : slots.first()).click();
      await dlg.locator("#pickup-name").fill("คิวเอ รับกลับ");
      await dlg.locator("#pickup-phone").fill(PHONE);
      await dlg.getByRole("button", { name: /ยืนยันสั่งอาหาร/ }).click();
      await page.waitForURL(/\/orders\/r\/R-\d+\?p=/, { timeout: 30_000 });
      shared.pickup = page.url().match(/R-\d+/)![0];
      await expect(page.getByText("รอชำระเงิน")).toBeVisible();
      // DEV_AUTO_APPROVE_SLIPS=true makes the storefront auto-approve uploads, so emulate a production slip
      // waiting for review: attach a slip URL to the pending payment and mark it pending_verification.
      const [o] = await db.select({ paymentId: restaurantOrders.paymentId }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, shared.pickup))).limit(1);
      if (!o?.paymentId) throw new Error("pickup order has no payment row");
      shared.pickupPaymentId = o.paymentId;
      await db.update(payments).set({ status: "pending_verification", slipUrl: "/uploads/qa/slip.png" }).where(and(eq(payments.tenantId, tenantId), eq(payments.id, o.paymentId)));
      return `${shared.pickup} (payment → pending_verification)`;
    });
    await ctx.close();
  }

  /* ───────── admin: orders board ───────── */
  current = a;
  const dineCard = () => a.getByRole("article", { name: `ออเดอร์ ${shared.dineIn}` });
  const pickCard = () => a.getByRole("article", { name: `ออเดอร์ ${shared.pickup}` });
  await step("2 board shows both orders in รับออเดอร์", async () => {
    await a.goto(`${base}/orders`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(a.getByRole("heading", { level: 1, name: "ออเดอร์ร้าน" })).toBeVisible();
    await expect(dineCard()).toBeVisible({ timeout: 15_000 });
    await expect(pickCard()).toBeVisible();
    await expect(dineCard()).toContainText(`โต๊ะ ${table.name}`);
    await expect(dineCard()).toContainText("ผัดกะเพราเนื้อโคขุน");
    await expect(dineCard()).toContainText("เผ็ดมาก");
    await expect(pickCard()).toContainText("รับกลับบ้าน");
    await expect(pickCard()).toContainText("รอตรวจสลิป");
    const col = a.getByRole("listitem", { name: "รับออเดอร์" });
    await expect(col.getByRole("article", { name: `ออเดอร์ ${shared.dineIn}` })).toBeVisible();
    await shot(a, "orders-1440");
  });
  await step("3 advance dine-in: เริ่มทำ → พร้อมเสิร์ฟ", async () => {
    await dineCard().getByRole("button", { name: "เริ่มทำ", exact: true }).click();
    await toast(a, /เริ่มทำแล้ว/);
    await expect(a.getByRole("listitem", { name: "กำลังทำ" }).getByRole("article", { name: `ออเดอร์ ${shared.dineIn}` })).toBeVisible({ timeout: 15_000 });
    await dineCard().getByRole("button", { name: "พร้อมเสิร์ฟ", exact: true }).click();
    await toast(a, /พร้อมเสิร์ฟแล้ว/);
    await expect(a.getByRole("listitem", { name: "พร้อมเสิร์ฟ / พร้อมรับ" }).getByRole("article", { name: `ออเดอร์ ${shared.dineIn}` })).toBeVisible({ timeout: 15_000 });
    const [row] = await db.select({ status: restaurantOrders.status }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, shared.dineIn!))).limit(1);
    if (row?.status !== "ready") throw new Error(`db status ${row?.status}`);
  });

  /* ───────── KDS ───────── */
  await step("4 KDS shows pickup ticket; per-item done → ticket becomes ready", async () => {
    await a.goto(`${base}/kitchen`, { waitUntil: "networkidle", timeout: 120_000 });
    const ticket = a.locator(`[aria-label="ตั๋ว ${shared.pickup}"]`);
    await expect(ticket).toBeVisible({ timeout: 15_000 });
    await expect(ticket).toContainText("หมูสะเต๊ะ");
    await expect(a.locator('section[aria-label="พร้อมเสิร์ฟ"]')).toContainText(shared.dineIn!);
    const items = ticket.locator('ul button[aria-pressed="false"]');
    const n = await items.count();
    if (n < 1) throw new Error("no open items on ticket");
    // the KDS deliberately shows no success toast (kitchen screen) – wait for the line to flip / the ticket to leave the grid
    for (let i = 0; i < n; i++) {
      const open = ticket.locator('ul button[aria-pressed="false"]');
      await open.first().click();
      if (i < n - 1) await expect(open).toHaveCount(n - i - 1, { timeout: 15_000 });
    }
    await expect(a.locator('section[aria-label="พร้อมเสิร์ฟ"]')).toContainText(shared.pickup!, { timeout: 15_000 });
    const [row] = await db.select({ status: restaurantOrders.status }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, shared.pickup!))).limit(1);
    if (row?.status !== "ready") throw new Error(`db status ${row?.status}`);
    return `${n} item(s) ticked`;
  });
  await step("4b KDS station tabs + screenshots (1440 / 820 / 390)", async () => {
    await a.getByRole("button", { name: /^บาร์/ }).click();
    await expect(a.getByRole("button", { name: /^บาร์/ })).toHaveAttribute("aria-pressed", "true");
    await a.getByRole("button", { name: /^ทั้งหมด/ }).click();
    await shot(a, "kitchen-1440");
    for (const w of [820, 390]) {
      const c = await browser.newContext({ viewport: { width: w, height: w === 820 ? 1180 : 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await admin.storageState() });
      const p = await c.newPage();
      await p.goto(`${base}/kitchen`, { waitUntil: "networkidle", timeout: 120_000 });
      await shot(p, `kitchen-${w}`);
      await c.close();
    }
  });

  /* ───────── close the table with cash ───────── */
  await step("5 ปิดโต๊ะ/รับชำระ (cash) closes the session, dine-in order paid", async () => {
    await a.goto(`${base}/orders`, { waitUntil: "networkidle", timeout: 120_000 });
    const card = a.locator('aside[aria-label="โต๊ะที่เปิดอยู่"] li').filter({ hasText: new RegExp(`โต๊ะ\\s*${table.name}\\b`) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: /ปิดโต๊ะ\/รับชำระ/ }).click();
    const dlg = a.getByRole("dialog");
    await expect(dlg.getByRole("heading", { name: `ปิดโต๊ะ ${table.name}` })).toBeVisible();
    await dlg.getByRole("button", { name: /รับเงินสด .*และปิดโต๊ะ/ }).click();
    await toast(a, /ปิดโต๊ะแล้ว/);
    await expect(card).toBeHidden({ timeout: 15_000 });
    const [o] = await db.select({ paymentStatus: restaurantOrders.paymentStatus }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, shared.dineIn!))).limit(1);
    const open = await db.select({ id: tableSessions.id }).from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.tableId, table.id), ne(tableSessions.status, "closed")));
    if (open.length) throw new Error(`session still open (${open.length})`);
    if (o?.paymentStatus !== "paid") throw new Error(`dine-in paymentStatus ${o?.paymentStatus}`);
    return "session closed, order paid (cash)";
  });

  /* ───────── pickup: approve slip ───────── */
  await step("6 pickup: อนุมัติสลิป → ชำระแล้ว", async () => {
    await expect(pickCard()).toBeVisible({ timeout: 15_000 });
    await pickCard().getByRole("button", { name: "อนุมัติสลิป" }).click();
    await toast(a, /อนุมัติการชำระเงินแล้ว/);
    await expect(pickCard()).toContainText("ชำระแล้ว", { timeout: 15_000 });
    const [o] = await db.select({ paymentStatus: restaurantOrders.paymentStatus }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, shared.pickup!))).limit(1);
    const [p] = await db.select({ status: payments.status }).from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, shared.pickupPaymentId!))).limit(1);
    if (o?.paymentStatus !== "paid" || p?.status !== "paid") throw new Error(`order ${o?.paymentStatus} / payment ${p?.status}`);
    await shot(a, "orders-after-1440");
  });
  await step("6b board at 390 + history tab", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await admin.storageState() });
    const p = await c.newPage();
    await p.goto(`${base}/orders`, { waitUntil: "networkidle", timeout: 120_000 });
    await shot(p, "orders-390");
    await c.close();
    await a.goto(`${base}/orders?tab=history&q=${shared.pickup}`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(a.getByText(shared.pickup!).first()).toBeVisible({ timeout: 15_000 });
  });

  /* ───────── menu: sold out ───────── */
  const soldOutRow = () => a.getByRole("row").filter({ hasText: SOLD_OUT_ITEM }).first();
  await step("7 menu: toggle หมดชั่วคราว → storefront /menu shows หมด", async () => {
    await a.goto(`${base}/menu`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(soldOutRow()).toBeVisible({ timeout: 15_000 });
    const sw = soldOutRow().getByRole("switch", { name: "หมดชั่วคราว" });
    if ((await sw.getAttribute("aria-checked")) === "true") await sw.click(); // reset leftovers from an earlier run
    await sw.click();
    await toast(a, /หมด|บันทึก/);
    await expect(sw).toHaveAttribute("aria-checked", "true");
    const [row] = await db.select({ soldOut: menuItems.soldOut }).from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.name, SOLD_OUT_ITEM))).limit(1);
    if (!row?.soldOut) throw new Error("db soldOut not set");
    const { ctx, page } = await storeCtx(browser);
    await page.goto(`${STORE}/menu`, { waitUntil: "networkidle", timeout: 60_000 });
    const card = page.getByRole("button", { name: new RegExp(`${SOLD_OUT_ITEM}.*หมดชั่วคราว`) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toBeDisabled();
    await expect(card.getByText("หมดชั่วคราว")).toBeVisible();
    await ctx.close();
    current = a;
  });
  await step("7b menu: toggle back → storefront sells it again", async () => {
    const sw = soldOutRow().getByRole("switch", { name: "หมดชั่วคราว" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await toast(a, /หมด|บันทึก|กลับมา|เปิดขาย/); // un-sold-out replies "เปิดขายอีกครั้งแล้ว" (AM-03)
    await a.waitForTimeout(500);
    const { ctx, page } = await storeCtx(browser);
    await page.goto(`${STORE}/menu`, { waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.getByRole("button", { name: new RegExp(`^${SOLD_OUT_ITEM}`) })).toBeEnabled({ timeout: 15_000 });
    await ctx.close();
    current = a;
  });

  /* ───────── tables print ───────── */
  await step("8 /tables/print renders QR cards", async () => {
    await a.goto(`${base}/tables/print`, { waitUntil: "networkidle", timeout: 120_000 });
    const cards = a.locator('ul[aria-label="ป้าย QR"] li');
    const n = await cards.count();
    if (n < 1) throw new Error("no QR cards");
    const src = await cards.first().locator("img").getAttribute("src");
    if (!src?.startsWith("data:image/")) throw new Error(`qr src ${src?.slice(0, 30)}`);
    await expect(cards.first()).toContainText(/demo-restaurant\.localhost:3000\/t\//);
    await expect(cards.filter({ hasText: `โต๊ะ ${table.name}` }).first()).toBeVisible();
    return `${n} cards`;
  });

  /* ───────── reservations ───────── */
  const tomorrow = ymdBangkok(new Date(Date.now() + 86_400_000));
  await step("9 reservations: create manual reservation", async () => {
    await a.goto(`${base}/reservations?date=${tomorrow}`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(a.getByRole("heading", { level: 1, name: "จองโต๊ะ" })).toBeVisible();
    await a.getByRole("button", { name: /เพิ่มการจอง/ }).first().click();
    const dlg = a.getByRole("dialog");
    await expect(dlg.getByRole("heading", { name: "เพิ่มการจอง" })).toBeVisible();
    await dlg.locator("#r-name").fill(RES_NAME);
    await dlg.locator("#r-phone").fill("0891234567");
    await dlg.locator("#r-party").fill("4");
    await dlg.locator("#r-date").fill(tomorrow);
    await dlg.locator("#r-time").fill("18:00");
    await dlg.locator("#r-note").fill("สร้างโดย QA journey");
    await dlg.locator('button[type="submit"]').click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    await a.goto(`${base}/reservations?date=${tomorrow}`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(a.locator("li").filter({ hasText: RES_NAME }).first()).toBeVisible({ timeout: 15_000 });
    await shot(a, "reservations-1440");
  });
  await step("9 (cont.) manual reservation is created already confirmed (phone booking)", async () => {
    const row = a.locator("li").filter({ hasText: RES_NAME }).first();
    await expect(row).toContainText("ยืนยันแล้ว");
    await expect(row.getByRole("button", { name: /นั่งแล้ว/ })).toBeVisible();
  });
  await step("9b pending (deposit) reservation → admin ยืนยัน → ยืนยันแล้ว", async () => {
    // demo-restaurant has no deposit configured, so both the web form and the admin dialog confirm bookings
    // immediately. A booking only waits in "pending" while a deposit is outstanding – emulate one directly.
    const number = `RS-QA${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const startsAt = new Date(`${tomorrow}T19:30:00+07:00`);
    await db.insert(reservations).values({ tenantId, number, name: "คิวเอ รอมัดจำ", phone: "0891234567", partySize: 2, startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60_000), zone: "ในบ้าน", status: "pending", depositAmount: 20000, note: "สร้างโดย QA journey (จำลองรอมัดจำ)" });
    await a.goto(`${base}/reservations?date=${tomorrow}`, { waitUntil: "networkidle", timeout: 120_000 });
    const row = a.locator("li").filter({ hasText: number }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("รอยืนยัน");
    await row.getByRole("button", { name: /^ยืนยัน(โดยไม่รอมัดจำ)?$/ }).first().click();
    await toast(a, /ยืนยัน/);
    await expect(row).toContainText("ยืนยันแล้ว", { timeout: 15_000 });
    await expect(row.getByRole("button", { name: /นั่งแล้ว/ })).toBeVisible();
    const [r] = await db.select({ status: reservations.status }).from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.number, number))).limit(1);
    if (r?.status !== "confirmed") throw new Error(`db status ${r?.status}`);
    shared.webReservation = number;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await admin.storageState() });
    const p = await c.newPage();
    await p.goto(`${base}/reservations?date=${tomorrow}`, { waitUntil: "networkidle", timeout: 120_000 });
    await shot(p, "reservations-390");
    await c.close();
    return `${number} confirmed`;
  });

  await admin.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  await writeFile(path.resolve(process.cwd(), "qa/restaurant-admin-journey-results.json"), JSON.stringify({ at: new Date().toISOString(), table: table.name, shared, results, adminErrors }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  if (adminErrors.length) console.log(`admin console/5xx (${adminErrors.length}):\n  ${[...new Set(adminErrors)].slice(0, 8).join("\n  ")}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
