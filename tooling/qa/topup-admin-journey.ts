import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq, getAdminDb, sql, codeStock, eventsOutbox, payments, topupBlacklist, topupOrders, topupSuppliers, walletTransactions, wallets, customers } from "@rentweb/db";

/**
 * Top-up back-office journey (admin on :3001 + storefront on demo-topup.localhost:3000).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-admin-journey.ts [--only 13,14]
 * Signs a fresh customer in on the storefront (dev OTP), credits the wallet from the admin, places manual / api /
 * PromptPay orders, then drives fulfil / fail+refund / batch / slip approve-reject / retry / notes, games + stock,
 * wallets, suppliers and blacklist. Screenshots → tooling/screenshots/topup-admin-*.png
 */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const STORE = "http://demo-topup.localhost:3000";
const SLUG = "demo-topup";
const TENANT = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const RUN = Date.now().toString(36).slice(-5);
const PHONE = `086${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const CUSTOMER_NAME = `คิวเอ แอดมิน ${RUN}`;
const UID = `77${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const FAKE_IP = `198.51.100.${Math.floor(Math.random() * 250) + 2}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
const shotsDir = path.resolve(process.cwd(), "screenshots");
let current: Page | null = null;
let adminPage: Page | null = null;
let failN = 0;
const only = process.argv.slice(2).flatMap((a, i, arr) => (a === "--only" && arr[i + 1] ? arr[i + 1]!.split(",") : []));

async function step(name: string, fn: () => Promise<string | void>) {
  if (only.length && !only.some((p) => name.split(" ")[0] === p)) return;
  const t0 = Date.now();
  current = adminPage;
  try {
    const note = await fn();
    results.push({ step: name, ok: true, note: note ?? undefined });
    console.log(`PASS ${name}${note ? `  — ${note}` : ""}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 6).join(" | ").slice(0, 700);
    results.push({ step: name, ok: false, note: msg });
    console.log(`FAIL ${name}  — ${msg}`);
    if (current) {
      const f = path.join(shotsDir, `topup-admin-fail-${String(++failN).padStart(2, "0")}.png`);
      await current.screenshot({ path: f }).catch(() => {});
      console.log(`     screenshot: ${f}`);
    }
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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

async function shot(page: Page, name: string) {
  const f = path.join(shotsDir, `topup-admin-${name}.png`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: f, animations: "disabled", fullPage: true });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = page.viewportSize()?.width ?? 0;
  const msg = scrollW > vw ? `  ⚠ horizontal overflow ${scrollW}px > ${vw}px` : "";
  console.log(`  shot ${f}${msg}`);
  return { f, overflow: scrollW - vw };
}

/* ── storefront helpers (dev OTP login + order placement) ─────────────────────────────── */
async function otpLogin(page: Page, phone: string, next = "/wallet") {
  await page.goto(`${STORE}/account/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.getByLabel("เบอร์โทรศัพท์").fill(phone);
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const code = (await page.getByText(/รหัสของคุณคือ/).locator("span").textContent({ timeout: 60_000 }))?.trim() ?? "";
  assert(/^\d{6}$/.test(code), `dev OTP code not shown (got "${code}")`);
  await page.locator("#otp-code").fill(code);
  await page.locator("#otp-name").fill(CUSTOMER_NAME);
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(next), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
}

async function placeOrder(page: Page, pkg: RegExp, method: "กระเป๋าเงินในเว็บ" | "PromptPay QR"): Promise<string> {
  await page.goto(`${STORE}/games/rov`, { waitUntil: "networkidle" });
  await page.locator("#pf-uid").fill(UID);
  await page.getByRole("radio", { name: pkg }).click();
  const l = page.locator("label").filter({ hasText: method }).first();
  await l.click();
  assert(await l.locator("input[type=radio]").isChecked(), `payment method ${method} not selected`);
  const btn = page.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
  await expect(btn).toBeEnabled({ timeout: 15_000 });
  await btn.click();
  await page.waitForURL(/\/topup\/TP-\d+/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const db = getAdminDb();
  const browser = await chromium.launch();
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await login(browser), locale: "th-TH" });
  const a = await admin.newPage();
  a.setDefaultTimeout(30_000);
  a.setDefaultNavigationTimeout(120_000);
  current = a;
  adminPage = a;
  const adminErrors: string[] = [];
  a.on("response", (r) => {
    if (r.status() >= 500) adminErrors.push(`${r.status()} ${r.url().slice(0, 140)}`);
  });
  a.on("pageerror", (e) => adminErrors.push(`pageerror ${e.message.slice(0, 200)}`));
  a.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) adminErrors.push(m.text().slice(0, 200));
  });
  const base = `${ADMIN}/t/${SLUG}/topup`;
  const store: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "th-TH", extraHTTPHeaders: { "x-forwarded-for": FAKE_IP } });
  const s = await store.newPage();
  s.setDefaultTimeout(60_000);
  s.setDefaultNavigationTimeout(120_000);

  const orderId = async (number: string) => {
    const [o] = await db.select({ id: topupOrders.id, status: topupOrders.status, paymentId: topupOrders.paymentId, supplierRef: topupOrders.supplierRef }).from(topupOrders).where(and(eq(topupOrders.tenantId, TENANT), eq(topupOrders.number, number))).limit(1);
    assert(o, `order ${number} not in db`);
    return o;
  };
  const openOrder = async (number: string) => {
    const o = await orderId(number);
    await a.goto(`${base}/orders/${o.id}`, { waitUntil: "networkidle" });
    await expect(a.getByRole("heading", { level: 1, name: number })).toBeVisible();
    return o;
  };
  const confirmDialog = async (label: string | RegExp) => {
    const dlg = a.getByRole("dialog");
    await dlg.getByRole("button", { name: label }).click();
  };
  const shared: Record<string, string> = { phone: PHONE, uid: UID, ip: FAKE_IP };
  let walletId = "";

  /* ───────── 1. customer + wallet credit ───────── */
  await step("1 storefront: OTP login with a fresh phone → /wallet opens an empty wallet", async () => {
    current = s;
    await otpLogin(s, PHONE, "/wallet");
    const [w] = await db
      .select({ id: wallets.id, balance: wallets.balance })
      .from(wallets)
      .innerJoin(customers, eq(customers.id, wallets.customerId))
      .where(and(eq(wallets.tenantId, TENANT), eq(customers.phone, PHONE)))
      .limit(1);
    assert(w, "wallet row not created by /wallet");
    walletId = w.id;
    current = a;
    return `${PHONE} wallet ${w.id.slice(-6)} balance ${w.balance}`;
  });

  await step("2 admin /topup/wallets: search phone → detail → credit ฿500 (double-click writes once)", async () => {
    await a.goto(`${base}/wallets?q=${PHONE}`, { waitUntil: "networkidle" });
    await expect(a.getByRole("heading", { level: 1, name: "กระเป๋าเงินลูกค้า" })).toBeVisible();
    await a.getByRole("link", { name: CUSTOMER_NAME }).click();
    await a.waitForURL(new RegExp(`/topup/wallets/${walletId}`));
    await expect(a.getByTestId("wallet-balance")).toHaveText("฿0");
    await a.getByRole("button", { name: "ปรับยอด" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#adj-amount").fill("500");
    await dlg.locator("#adj-reason").fill(`QA เติมเครดิตทดสอบ ${RUN}`);
    await expect(dlg.getByText("คงเหลือหลังปรับ ฿500")).toBeVisible();
    await dlg.getByRole("button", { name: "ยืนยันเพิ่มเงิน" }).dblclick();
    await toast(a, /เพิ่ม ฿500 แล้ว|บันทึกไปแล้ว/);
    await expect(a.getByTestId("wallet-balance")).toHaveText("฿500", { timeout: 15_000 });
    const rows = await db.select({ id: walletTransactions.id, key: walletTransactions.idempotencyKey }).from(walletTransactions).where(and(eq(walletTransactions.tenantId, TENANT), eq(walletTransactions.walletId, walletId), eq(walletTransactions.reason, "adjustment")));
    assert(rows.length === 1, `expected 1 adjustment row, got ${rows.length}`);
    assert(rows[0]!.key?.startsWith(`adjust:${walletId}:`), `idempotency key ${rows[0]!.key}`);
    await expect(a.locator('[data-ledger-reason="adjustment"]').first()).toContainText(`QA เติมเครดิตทดสอบ ${RUN}`);
    return "balance ฿500, 1 ledger row with idempotency key";
  });

  /* ───────── 3. orders from the storefront ───────── */
  await step("3 storefront: 4× manual 120 คูปอง + 1× api 40 คูปอง via wallet, 1× manual 500 คูปอง via PromptPay", async () => {
    current = s;
    for (const k of ["A", "B", "C", "D"]) shared[k] = await placeOrder(s, /120 คูปอง/, "กระเป๋าเงินในเว็บ");
    shared.E = await placeOrder(s, /^40 คูปอง/, "กระเป๋าเงินในเว็บ");
    shared.F = await placeOrder(s, /500 คูปอง/, "PromptPay QR");
    for (const k of ["A", "B", "C", "D"]) assert((await orderId(shared[k]!)).status === "processing", `${k} ${shared[k]} not processing`);
    assert((await orderId(shared.E!)).status === "fulfilled", `E ${shared.E} not fulfilled`);
    assert((await orderId(shared.F!)).status === "pending_payment", `F ${shared.F} not pending_payment`);
    current = a;
    return `A=${shared.A} B=${shared.B} C=${shared.C} D=${shared.D} E=${shared.E} F=${shared.F}`;
  });

  await step("4 /topup/orders รอเติม tab lists the manual orders; search by number and by UID", async () => {
    await a.goto(`${base}/orders?tab=manual`, { waitUntil: "networkidle" });
    await expect(a.getByRole("heading", { level: 1, name: "รายการเติม" })).toBeVisible();
    for (const k of ["A", "B", "C", "D"]) await expect(a.getByRole("link", { name: shared[k]!, exact: true })).toBeVisible();
    await expect(a.locator('nav[aria-label="ตัวกรองด่วน"] a[aria-current="page"]')).toContainText("รอเติม");
    await a.goto(`${base}/orders?tab=all&q=${shared.A}`, { waitUntil: "networkidle" });
    const links = a.locator("tbody a[href*='/topup/orders/']");
    await expect(links).toHaveCount(1);
    await a.goto(`${base}/orders?tab=all&q=${UID}`, { waitUntil: "networkidle" });
    await expect(links).toHaveCount(6);
    await a.goto(`${base}/orders?tab=all&q=${PHONE}`, { waitUntil: "networkidle" });
    await expect(links).toHaveCount(6);
    return "4 in รอเติม; number→1 row, UID→6, phone→6";
  });

  await step("5 order A detail: player fields + copy, cost/profit, timeline; add internal note", async () => {
    await openOrder(shared.A!);
    await expect(a.getByRole("button", { name: new RegExp(`คัดลอก.*${UID}`) }).first()).toBeVisible();
    await expect(a.getByText("กำไร", { exact: true })).toBeVisible();
    await expect(a.getByText("฿4", { exact: true })).toBeVisible(); // 99 - 95
    await expect(a.getByText("ชำระเงินแล้ว", { exact: true })).toBeVisible();
    await a.getByLabel("โน้ตภายใน").fill(`QA โน้ต: เช็ค UID แล้ว ${RUN}`);
    await a.getByRole("button", { name: "เพิ่มโน้ต" }).click();
    await toast(a, /เพิ่มโน้ตแล้ว/);
    await expect(a.getByText(`QA โน้ต: เช็ค UID แล้ว ${RUN}`)).toBeVisible();
    await shot(a, "order-detail-1440");
    return "copy buttons, profit ฿4, note saved";
  });

  await step("6 order A: เติมสำเร็จ with proof upload + delivered code → status เติมสำเร็จ, event topup.fulfilled", async () => {
    await a.getByRole("button", { name: "เติมสำเร็จ", exact: true }).click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#proof-file").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: PNG });
    await expect(dlg.getByRole("img", { name: "หลักฐานการเติม" })).toBeVisible({ timeout: 30_000 });
    await dlg.locator("#delivered-code").fill(`QA-CODE-${RUN}`);
    await dlg.getByRole("button", { name: "ยืนยันเติมสำเร็จ" }).click();
    await toast(a, /เป็นเติมสำเร็จแล้ว/);
    await expect(a.locator("h1").locator("..").getByText("เติมสำเร็จ", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(a.getByText(`QA-CODE-${RUN}`)).toBeVisible();
    const [o] = await db.select({ status: topupOrders.status, proof: topupOrders.proofImage, code: topupOrders.deliveredCodeEncrypted }).from(topupOrders).where(and(eq(topupOrders.tenantId, TENANT), eq(topupOrders.number, shared.A!)));
    assert(o?.status === "fulfilled" && o.proof && o.code, `db ${JSON.stringify(o)}`);
    const ev = await db.select({ id: eventsOutbox.id }).from(eventsOutbox).where(and(eq(eventsOutbox.tenantId, TENANT), eq(eventsOutbox.type, "topup.fulfilled"), sql`${eventsOutbox.payload}->>'number' = ${shared.A!}`));
    assert(ev.length >= 1, "topup.fulfilled event missing");
    shared.proof = o.proof!;
    return `proof ${o.proof!.slice(-30)}, code encrypted, event ok`;
  });

  await step("7 storefront /topup/<A> shows เติมสำเร็จ + the delivered code to the owner", async () => {
    current = s;
    await s.goto(`${STORE}/topup/${shared.A}`, { waitUntil: "networkidle" });
    await expect(s.getByText("เติมสำเร็จ", { exact: true }).first()).toBeVisible();
    // the storefront masks delivered codes until the owner taps "แสดงโค้ด"
    await s.getByRole("button", { name: /แสดงโค้ด/ }).click();
    await expect(s.getByText(`QA-CODE-${RUN}`).first()).toBeVisible();
    await shot(s, "storefront-order-fulfilled");
  });

  await step("8 order B: เติมไม่สำเร็จ → automatic wallet refund; /topup/wallets/[id] shows +฿99 refund", async () => {
    await openOrder(shared.B!);
    await a.getByRole("button", { name: "เติมไม่สำเร็จ" }).click();
    const dlg = a.getByRole("dialog");
    await expect(dlg.getByText(/คืนเงิน 99 บาท เข้ากระเป๋าเงินของลูกค้าอัตโนมัติ/)).toBeVisible();
    await dlg.locator("#fail-reason").selectOption("UID ไม่ถูกต้อง / ไม่พบผู้เล่น");
    await dlg.getByRole("button", { name: "ยืนยันเติมไม่สำเร็จ" }).click();
    await toast(a, /คืนเงินเข้ากระเป๋าลูกค้าแล้ว/);
    await expect(a.getByText(/คืนเงิน ฿99 เข้ากระเป๋าลูกค้าแล้ว/)).toBeVisible({ timeout: 15_000 });
    assert((await orderId(shared.B!)).status === "refunded", "B not refunded");
    await a.goto(`${base}/wallets/${walletId}`, { waitUntil: "networkidle" });
    const refund = a.locator('[data-ledger-reason="refund"]').first();
    await expect(refund).toContainText("+฿99");
    await expect(refund).toContainText(shared.B!);
    // 500 − 4×99 − 35 + 99 = 168
    await expect(a.getByTestId("wallet-balance")).toHaveText("฿168");
    await shot(a, "wallet-detail-1440");
    return "refunded, ledger +฿99, balance ฿168";
  });

  await step("9 batch: select C + D in รอเติม → เติมสำเร็จที่เลือก → both fulfilled", async () => {
    await a.goto(`${base}/orders?tab=manual`, { waitUntil: "networkidle" });
    await a.getByRole("checkbox", { name: `เลือก ${shared.C}` }).click();
    await a.getByRole("checkbox", { name: `เลือก ${shared.D}` }).click();
    await expect(a.getByText(/เลือกแล้ว\s*2/)).toBeVisible();
    await a.getByRole("button", { name: /เติมสำเร็จที่เลือก/ }).click();
    await confirmDialog("เติมสำเร็จทั้งหมด");
    await toast(a, /เติมสำเร็จ 2 รายการ/);
    await expect(a.getByRole("link", { name: shared.C!, exact: true })).toHaveCount(0, { timeout: 15_000 });
    for (const k of ["C", "D"]) assert((await orderId(shared[k]!)).status === "fulfilled", `${k} not fulfilled`);
    await shot(a, "orders-1440");
    return "C + D fulfilled";
  });

  await step("10 slip: F → pending_verification (db) → รอตรวจสลิป → ปฏิเสธ → อนุมัติ → รอเติม → fail flags ต้องคืนเงินมือ", async () => {
    const f = await orderId(shared.F!);
    assert(f.paymentId, "F has no payment");
    // DEV_AUTO_APPROVE_SLIPS=true would approve a real upload instantly – emulate a slip waiting for review
    await db.update(payments).set({ status: "pending_verification", slipUrl: shared.proof ?? `${ADMIN}/favicon.ico`, method: "slip" }).where(and(eq(payments.tenantId, TENANT), eq(payments.id, f.paymentId)));
    await a.goto(`${base}/orders?tab=verify`, { waitUntil: "networkidle" });
    await a.getByRole("link", { name: shared.F!, exact: true }).click();
    await expect(a.getByRole("heading", { level: 1, name: shared.F! })).toBeVisible();
    await expect(a.getByRole("button", { name: new RegExp(`ดูสลิป ${shared.F}`) })).toBeVisible();
    await a.getByRole("button", { name: "ปฏิเสธสลิป" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#reject-reason").selectOption("ยอดเงินไม่ตรง");
    await dlg.getByRole("button", { name: "ปฏิเสธสลิป" }).click();
    await toast(a, /ปฏิเสธสลิปแล้ว/);
    const [p1] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, f.paymentId));
    assert(p1?.status === "failed", `payment after reject ${p1?.status}`);
    await a.getByRole("button", { name: "อนุมัติสลิป" }).click();
    await confirmDialog("อนุมัติสลิป");
    await toast(a, /อนุมัติสลิปแล้ว/);
    await expect(a.locator("h1").locator("..").getByText("กำลังเติม", { exact: true })).toBeVisible({ timeout: 15_000 });
    assert((await orderId(shared.F!)).status === "processing", "F not processing after approve");
    await a.getByRole("button", { name: "เติมไม่สำเร็จ" }).click();
    await expect(a.getByRole("dialog").getByText(/ต้องคืนเงินมือ/)).toBeVisible();
    await a.getByRole("dialog").getByRole("button", { name: "ยืนยันเติมไม่สำเร็จ" }).click();
    await toast(a, /กรุณาคืนเงินลูกค้าด้วยตนเอง/);
    await expect(a.getByText("ต้องคืนเงินมือ").first()).toBeVisible({ timeout: 15_000 });
    return "reject → failed, approve → processing, fail → refundRequired";
  });

  await step("11 api retry: E stuck in processing (db) → ลองใหม่ → fulfilled with a new SIM ref", async () => {
    const e0 = await orderId(shared.E!);
    await db.update(topupOrders).set({ status: "processing", fulfilledAt: null, supplierRef: null }).where(and(eq(topupOrders.tenantId, TENANT), eq(topupOrders.id, e0.id)));
    await openOrder(shared.E!);
    await a.getByRole("button", { name: "ลองใหม่" }).click();
    await confirmDialog("ลองใหม่");
    await toast(a, /ลองใหม่สำเร็จ/);
    const e1 = await orderId(shared.E!);
    assert(e1.status === "fulfilled" && e1.supplierRef?.startsWith("SIM-") && e1.supplierRef !== e0.supplierRef, `after retry ${JSON.stringify(e1)}`);
    await expect(a.getByText("แอดมินสั่งลองเติมใหม่")).toBeVisible({ timeout: 15_000 });
    return `${e0.supplierRef} → ${e1.supplierRef}`;
  });

  /* ───────── wallets ───────── */
  await step("12 wallet: debit guard, freeze → adjust disabled → unfreeze", async () => {
    await a.goto(`${base}/wallets/${walletId}`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "ปรับยอด" }).click();
    let dlg = a.getByRole("dialog");
    await dlg.getByText("หักเงิน").click();
    await dlg.locator("#adj-amount").fill("999");
    await dlg.locator("#adj-reason").fill("QA หักเกินยอด");
    await dlg.getByRole("button", { name: "ยืนยันหักเงิน" }).click();
    await expect(dlg.getByText(/ยอดคงเหลือมีเพียง ฿168/)).toBeVisible();
    await dlg.getByRole("button", { name: "ยกเลิก" }).click();
    await a.getByRole("button", { name: "ระงับ", exact: true }).click();
    await confirmDialog("ระงับกระเป๋า");
    await toast(a, /ระงับกระเป๋าเงินแล้ว/);
    await expect(a.getByTestId("wallet-frozen")).toBeVisible({ timeout: 15_000 });
    await expect(a.getByRole("button", { name: "ปรับยอด" })).toBeDisabled();
    const [w] = await db.select({ frozen: wallets.frozen }).from(wallets).where(eq(wallets.id, walletId));
    assert(w?.frozen === true, "db not frozen");
    await a.goto(`${base}/wallets?frozen=1`, { waitUntil: "networkidle" });
    await expect(a.getByRole("link", { name: CUSTOMER_NAME })).toBeVisible();
    await a.goto(`${base}/wallets/${walletId}`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "ปลดระงับ" }).click();
    await confirmDialog("ปลดระงับ");
    await toast(a, /ปลดระงับกระเป๋าเงินแล้ว/);
    await expect(a.getByTestId("wallet-frozen")).toHaveCount(0, { timeout: 15_000 });
    dlg = a.getByRole("dialog");
    return "insufficient blocked client-side, freeze/unfreeze + frozen filter";
  });

  /* ───────── games + stock ───────── */
  await step("13 games: steam-wallet → สต็อกโค้ด ฿100 → import 3 codes (+3, encrypted) → void one (−1)", async () => {
    await a.goto(`${base}/games`, { waitUntil: "networkidle" });
    await expect(a.getByRole("heading", { level: 1, name: "เกมและแพ็กเกจ" })).toBeVisible();
    await shot(a, "games-1440");
    await a.getByRole("link", { name: /Steam Wallet \(TH\)/ }).click();
    await a.waitForURL(/\/topup\/games\/[0-9a-f-]{36}/);
    await a.getByRole("link", { name: /สต็อกโค้ด/ }).first().click();
    await a.waitForURL(/tab=stock/);
    await a.getByRole("link", { name: /^฿100/ }).click();
    await a.waitForURL(/stock=/);
    const pkgId = new URL(a.url()).searchParams.get("stock")!;
    const avail = a.getByTestId("stock-available");
    const before = Number((await avail.textContent())?.replace(/,/g, ""));
    const codes = [1, 2, 3].map((i) => `QA-STEAM-${RUN.toUpperCase()}-000${i}`);
    await a.locator("#stock-codes").fill(codes.join("\n"));
    await expect(a.getByText("3 โค้ด", { exact: true })).toBeVisible();
    await a.getByRole("button", { name: "นำเข้าโค้ด" }).click();
    await toast(a, /นำเข้า 3 โค้ด/);
    await expect(avail).toHaveText(String(before + 3), { timeout: 15_000 });
    const rows = await db.select({ enc: codeStock.codeEncrypted }).from(codeStock).where(and(eq(codeStock.tenantId, TENANT), eq(codeStock.packageId, pkgId), eq(codeStock.status, "available"))).orderBy(sql`${codeStock.createdAt} desc`).limit(3);
    assert(rows.length === 3 && rows.every((r) => !r.enc.includes("QA-STEAM")), "codes not stored encrypted");
    await shot(a, "game-stock-1440");
    await a.getByRole("button", { name: /^ยกเลิกโค้ด/ }).first().click();
    await confirmDialog("ยกเลิกโค้ด");
    await toast(a, /ยกเลิกโค้ดแล้ว/);
    await expect(avail).toHaveText(String(before + 2), { timeout: 15_000 });
    shared.stockPkg = pkgId;
    return `available ${before} → ${before + 3} → ${before + 2}`;
  });

  await step("14 games/new: create game (2 fields incl. select) → add + edit package inline → storefront page → delete", async () => {
    const name = `QA เกมทดสอบ ${RUN}`;
    await a.goto(`${base}/games/new`, { waitUntil: "networkidle" });
    await a.locator("#g-name").fill(name);
    await expect(a.locator("#g-slug")).toHaveValue(`qa-${RUN}`);
    await a.locator("#g-publisher").fill("QA Studio");
    await a.getByRole("button", { name: "เพิ่มช่อง" }).click();
    await a.locator("#f-key-1").fill("server");
    await a.locator("#f-label-1").fill("เซิร์ฟเวอร์");
    await a.locator("#f-type-1").selectOption("select");
    await a.getByRole("button", { name: "สร้างเกม" }).click();
    await toast(a, /อย่างน้อย 1 ตัวเลือก/);
    await expect(a.getByText("ใส่ตัวเลือกอย่างน้อย 1 รายการ")).toBeVisible();
    await a.locator("#f-opt-1").fill("Asia\nEurope");
    await a.getByRole("button", { name: "สร้างเกม" }).click();
    await a.waitForURL(/\/topup\/games\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await toast(a, /เพิ่มเกม/);
    const gameId = a.url().split("/").pop()!;
    // new game has no packages → the inline editor is open
    await a.locator("#pkg-new-name").fill("100 เพชร QA");
    await a.locator("#pkg-new-price").fill("50");
    await a.locator("#pkg-new-cost").fill("45");
    await expect(a.getByText("กำไร ฿5 / รายการ")).toBeVisible();
    await a.getByRole("button", { name: "เพิ่มแพ็กเกจ" }).click();
    await toast(a, /เพิ่มแพ็กเกจ/);
    const row = a.locator('[data-package-row="100 เพชร QA"]');
    await expect(row).toContainText("฿50");
    await row.getByRole("button", { name: "แก้ไข 100 เพชร QA" }).click();
    const editor = a.locator('[data-package-row="100 เพชร QA"] form');
    await editor.locator('input[id$="-price"]').fill("55");
    await editor.getByRole("button", { name: "บันทึกแพ็กเกจ" }).click();
    await toast(a, /บันทึกแพ็กเกจ/);
    await expect(a.locator('[data-package-row="100 เพชร QA"]')).toContainText("฿55", { timeout: 15_000 });
    await shot(a, "game-packages-1440");
    current = s;
    await s.goto(`${STORE}/games/qa-${RUN}`, { waitUntil: "networkidle" });
    await expect(s.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(s.getByRole("radio", { name: /100 เพชร QA/ })).toBeVisible();
    await expect(s.locator("#pf-server")).toBeVisible();
    current = a;
    await a.goto(`${base}/games/${gameId}?tab=info`, { waitUntil: "networkidle" });
    await expect(a.locator("#g-name")).toHaveValue(name);
    await a.getByRole("button", { name: "ลบเกม" }).click();
    await confirmDialog("ลบเกม");
    await a.waitForURL(/\/topup\/games$/, { timeout: 30_000 });
    await expect(a.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
    return `qa-${RUN} created, package ฿50→฿55, visible on storefront, deleted`;
  });

  /* ───────── suppliers + blacklist ───────── */
  await step("15 suppliers: add (invalid JSON rejected) → listed → edit → delete", async () => {
    const name = `QA Supplier ${RUN}`;
    await a.goto(`${base}/suppliers`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "เพิ่ม supplier" }).click();
    const dlg = a.getByRole("dialog");
    await dlg.locator("#sup-name").fill(name);
    await dlg.locator("#sup-config").fill("{ baseUrl: oops");
    await dlg.getByRole("button", { name: "บันทึก" }).click();
    await expect(dlg.getByText("config ไม่ใช่ JSON ที่ถูกต้อง")).toBeVisible();
    await dlg.locator("#sup-config").fill('{"baseUrl":"https://api.qa.example","apiKey":"x"}');
    await dlg.getByRole("button", { name: "บันทึก" }).click();
    await expect(dlg.getByText(/ลบคีย์ “apiKey” ออก/)).toBeVisible();
    await dlg.locator("#sup-config").fill('{"baseUrl":"https://api.qa.example","timeoutMs":8000}');
    await dlg.getByRole("button", { name: "บันทึก" }).click();
    await toast(a, /เพิ่ม supplier/);
    const card = a.locator(`[data-supplier="${name}"]`);
    await expect(card).toContainText("HTTP API ทั่วไป");
    await expect(card).toContainText("baseUrl, timeoutMs");
    await shot(a, "suppliers-1440");
    await card.getByRole("button", { name: `แก้ไข ${name}` }).click();
    await a.getByRole("dialog").locator("#sup-name").fill(`${name} v2`);
    await a.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
    await toast(a, /บันทึก “QA Supplier/);
    const card2 = a.locator(`[data-supplier="${name} v2"]`);
    await expect(card2).toBeVisible({ timeout: 15_000 });
    await card2.getByRole("button", { name: `ลบ ${name} v2` }).click();
    await confirmDialog("ลบ");
    await toast(a, /ลบ supplier แล้ว/);
    await expect(card2).toHaveCount(0, { timeout: 15_000 });
    const left = await db.select({ id: topupSuppliers.id }).from(topupSuppliers).where(and(eq(topupSuppliers.tenantId, TENANT), sql`${topupSuppliers.name} like ${`QA Supplier ${RUN}%`}`));
    assert(left.length === 0, "supplier row left behind");
    return "create / validate / edit / delete OK";
  });

  await step("16 blacklist: prefill from order page → block UID → listed → unblock", async () => {
    await openOrder(shared.B!);
    await a.getByRole("link", { name: "บล็อก UID นี้" }).click();
    await a.waitForURL(/\/topup\/blacklist\?kind=uid/);
    await expect(a.locator("#bl-kind")).toHaveValue("uid");
    await expect(a.locator("#bl-value")).toHaveValue(UID);
    await a.locator("#bl-reason").fill(`QA บล็อกทดสอบ ${RUN}`);
    await a.getByRole("button", { name: "บล็อก", exact: true }).click();
    await toast(a, /บล็อก .* แล้ว/);
    const item = a.locator(`[data-blacklist-value="${UID}"]`);
    await expect(item).toContainText(`QA บล็อกทดสอบ ${RUN}`, { timeout: 15_000 });
    await shot(a, "blacklist-1440");
    await item.getByRole("button", { name: `ปลดบล็อก ${UID}` }).click();
    await confirmDialog("ปลดบล็อก");
    await toast(a, /ปลดบล็อกแล้ว/);
    await expect(item).toHaveCount(0, { timeout: 15_000 });
    const left = await db.select({ id: topupBlacklist.id }).from(topupBlacklist).where(and(eq(topupBlacklist.tenantId, TENANT), eq(topupBlacklist.value, UID)));
    assert(left.length === 0, "blacklist row left behind");
    return `UID ${UID} blocked + unblocked`;
  });

  /* ───────── phone layout ───────── */
  await step("17 phone 390px: main pages render without page-level horizontal overflow", async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await admin.storageState(), locale: "th-TH", isMobile: true, hasTouch: true });
    const p = await m.newPage();
    current = p;
    const gameRow = await db.execute(sql`select id from games where tenant_id = ${TENANT} and slug = 'steam-wallet' limit 1`);
    const steamId = ((Array.isArray(gameRow) ? gameRow : (gameRow as { rows: unknown[] }).rows)[0] as { id: string }).id;
    const pages: Array<[string, string]> = [
      ["orders-390", `${base}/orders?tab=all`],
      ["order-detail-390", `${base}/orders/${(await orderId(shared.A!)).id}`],
      ["games-390", `${base}/games`],
      ["game-packages-390", `${base}/games/${steamId}`],
      ["game-stock-390", `${base}/games/${steamId}?tab=stock&stock=${shared.stockPkg ?? ""}`],
      ["game-info-390", `${base}/games/${steamId}?tab=info`],
      ["wallets-390", `${base}/wallets`],
      ["wallet-detail-390", `${base}/wallets/${walletId}`],
      ["suppliers-390", `${base}/suppliers`],
      ["blacklist-390", `${base}/blacklist`],
    ];
    const bad: string[] = [];
    for (const [name, url] of pages) {
      await p.goto(url, { waitUntil: "networkidle" });
      const r = await shot(p, name);
      if (r.overflow > 0) bad.push(`${name} +${r.overflow}px`);
    }
    await m.close();
    current = a;
    assert(bad.length === 0, `overflow: ${bad.join(", ")}`);
    return `${pages.length} pages, no overflow`;
  });

  await step("18 no admin 5xx / page errors during the journey", async () => {
    const uniq = [...new Set(adminErrors)];
    assert(uniq.length === 0, uniq.slice(0, 6).join(" || "));
  });

  await store.close();
  await admin.close();
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  await writeFile(path.resolve(process.cwd(), "qa/topup-admin-journey-results.json"), JSON.stringify({ at: new Date().toISOString(), shared, results, adminErrors: [...new Set(adminErrors)] }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
