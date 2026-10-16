import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, desc, eq, getDb, orders, payments, products, withTenant } from "@rentweb/db";
import { attachSlip } from "@rentweb/core/payments";
import { tenantIdBySlug } from "./stock";

/**
 * Commerce back-office QA journey (admin app on :3001, storefront on :3000), run in Chromium.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/commerce-admin-journey.ts [demo-shop] [--shots]
 * Steps: login → /orders list → create manual order → confirm → ship (tracking) → shipped in DB
 *        → /products/new with 2 variants → visible on storefront → /discounts create → /shipping create
 *        → slip queue: manual slip order + attachSlip (pending_verification) → /payments approve → order paid
 *        → /reviews loads → print page → screenshots (1440 + 390) of every main page with overflow check.
 */
const admin = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const webPort = process.env.PORT ?? "3000";
const slug = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "demo-shop";
const shots = !process.argv.includes("--no-shots");
const outDir = path.resolve(process.cwd(), "screenshots");
const stamp = Date.now().toString(36).toUpperCase().slice(-5);
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
let current: Page | null = null;
async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? undefined;
    results.push({ step: name, ok: true, note });
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""} (${Date.now() - t0}ms)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0]!.slice(0, 300) : String(e);
    results.push({ step: name, ok: false, note: msg });
    console.log(`FAIL  ${name} — ${msg}`);
    if (current) await current.screenshot({ path: path.join(outDir, `qa-admin-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) }).catch(() => {});
  }
}

async function login(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.goto(`${admin}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", process.env.QA_ADMIN_EMAIL ?? "admin@rentweb.local");
  await page.fill("#password", process.env.QA_ADMIN_PASSWORD ?? "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.close();
}

const t = (p: string) => `${admin}/t/${slug}${p}`;
const goto = (page: Page, p: string) => page.goto(p.startsWith("http") ? p : t(p), { waitUntil: "networkidle", timeout: 120_000 });
async function toastOrText(page: Page, text: string, timeout = 20_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}
async function dialogButton(page: Page, name: string) {
  const btn = page.getByRole("dialog").getByRole("button", { name });
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  return btn;
}

async function dbOrderByNumber(tenantId: string, number: string) {
  return withTenant(getDb(), tenantId, async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.number, number))).limit(1);
    if (!o) return null;
    const pays = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, o.id))).orderBy(desc(payments.createdAt));
    return { order: o, payments: pays };
  });
}

async function createManualOrder(page: Page, opts: { payment: "cash" | "slip"; markPaid: boolean }): Promise<{ number: string; id: string }> {
  await goto(page, "/orders/new");
  // add a seeded in-stock product (searching keeps the run independent of leftover QA products whose variants may be sold out)
  await page.getByLabel("ค้นหาสินค้า").fill(process.env.QA_ORDER_PRODUCT ?? "ปลอกหมอน");
  const addBtn = page.getByRole("button", { name: new RegExp(`^เพิ่ม .*${process.env.QA_ORDER_PRODUCT ?? "ปลอกหมอน"}`) }).first();
  await addBtn.waitFor({ state: "visible", timeout: 20_000 });
  await addBtn.click();
  await page.fill("#c-name", "QA ลูกค้าหลังบ้าน");
  await page.fill("#c-phone", "0899990001");
  if (await page.locator("#a-line1").count()) {
    await page.fill("#a-line1", "12/3 ถนนทดสอบ");
    await page.fill("#a-sub", "คลองเตย");
    await page.fill("#a-dist", "คลองเตย");
    await page.fill("#a-prov", "กรุงเทพมหานคร");
    await page.fill("#a-post", "10110");
  }
  await page.getByRole("radio", { name: opts.payment === "cash" ? "เงินสด" : "โอนเงิน (สลิป)" }).click();
  if (opts.payment !== "cash") {
    const cb = page.getByRole("checkbox", { name: /ได้รับเงินแล้ว/ });
    const checked = (await cb.getAttribute("data-state")) === "checked" || (await cb.getAttribute("aria-checked")) === "true";
    if (checked !== opts.markPaid) await cb.click();
  }
  await page.getByRole("button", { name: /^สร้างออเดอร์/ }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  const h1 = (await page.locator("h1").first().textContent()) ?? "";
  const number = h1.match(/#\d+/)?.[0];
  if (!number) throw new Error(`order number not found in heading "${h1}"`);
  return { number, id: page.url().split("/").pop()! };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const tenantId = await tenantIdBySlug(slug);
  const browser: Browser = await chromium.launch();
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await login(loginCtx);
  const storageState = await loginCtx.storageState();
  await loginCtx.close();
  console.log(`signed in · tenant ${slug}`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", storageState, locale: "th-TH" });
  const page = await ctx.newPage();
  current = page;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

  let orderId = "";
  let orderNumber = "";
  let productSlug = "";
  let productId = "";
  const productName = `QA เสื้อยืดทดสอบ ${stamp}`;
  const couponCode = `QA${stamp}`;

  await step("1 orders list renders with storefront orders", async () => {
    await goto(page, "/orders");
    await page.getByRole("heading", { name: "ออเดอร์" }).first().waitFor({ timeout: 30_000 });
    const rows = await page.locator("table tbody tr").count();
    if (rows === 0) return "no orders yet (will create one)";
    const tabs = await page.locator('nav[aria-label="ตัวกรองด่วน"] a').allTextContents();
    return `${rows} rows · tabs: ${tabs.map((x) => x.replace(/\s+/g, " ").trim()).join(" | ")}`;
  });

  await step("1b filters: tab รอจัดส่ง + search by number", async () => {
    await goto(page, "/orders?tab=to_ship");
    await page.getByRole("heading", { name: "ออเดอร์" }).first().waitFor();
    await goto(page, "/orders?q=1001");
    const hasRow = (await page.locator("table tbody tr").count()) > 0;
    const hasEmpty = (await page.getByText("ไม่พบออเดอร์ตามเงื่อนไข").count()) > 0;
    if (!hasRow && !hasEmpty) throw new Error("neither rows nor empty state after search");
    return hasRow ? "found #1001" : "empty state shown";
  });

  await step("2 create manual order (cash, paid) via /orders/new", async () => {
    const r = await createManualOrder(page, { payment: "cash", markPaid: true });
    orderId = r.id;
    orderNumber = r.number;
    const db = await dbOrderByNumber(tenantId, orderNumber);
    if (!db) throw new Error("order not in DB");
    if (db.order.paymentStatus !== "paid") throw new Error(`expected paid, got ${db.order.paymentStatus}`);
    if (db.order.status !== "confirmed") throw new Error(`expected confirmed, got ${db.order.status}`);
    if (db.order.source !== "admin") throw new Error(`source ${db.order.source}`);
    return `${orderNumber} paid/confirmed · total ${db.order.total}`;
  });

  await step("3 order detail shows items, payment, timeline, actions", async () => {
    await goto(page, `/orders/${orderId}`);
    for (const txt of ["รายการสินค้า", "การชำระเงิน", "ไทม์ไลน์", "ที่อยู่จัดส่ง", "โน้ตภายใน"]) await page.getByText(txt).first().waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /จัดส่ง$/ }).first().waitFor();
    return "ok";
  });

  await step("3b internal note saves", async () => {
    await page.getByLabel("โน้ตภายใน").fill(`QA note ${stamp}`);
    await page.getByRole("button", { name: "บันทึกโน้ต" }).click();
    await toastOrText(page, "บันทึกโน้ตภายในแล้ว");
    const db = await dbOrderByNumber(tenantId, orderNumber);
    if (!db?.order.internalNote?.includes(stamp)) throw new Error("note not persisted");
  });

  await step("4 ship with tracking → status shipped + shipment row + event", async () => {
    await page.getByRole("button", { name: /จัดส่ง$/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.locator("#ship-carrier").selectOption("kerry");
    await page.fill("#ship-tracking", `KEX${stamp}0001`);
    await (await dialogButton(page, "บันทึกการจัดส่ง")).click();
    await toastOrText(page, "บันทึกการจัดส่งแล้ว");
    await page.waitForFunction(() => document.body.innerText.includes("ติดตามพัสดุ"), undefined, { timeout: 20_000 });
    const db = await dbOrderByNumber(tenantId, orderNumber);
    if (db?.order.status !== "shipped") throw new Error(`status ${db?.order.status}`);
    const ev = await withTenant(getDb(), tenantId, async (tx) => {
      const rows = await tx.execute<{ payload: Record<string, unknown> }>(`select payload from events_outbox where tenant_id = '${tenantId}' and type = 'order.shipped' order by created_at desc limit 1`);
      const arr = (Array.isArray(rows) ? rows : (rows as unknown as { rows: unknown[] }).rows) as Array<{ payload: Record<string, unknown> }>;
      return arr[0]?.payload;
    });
    if (!ev || ev.trackingNumber !== `KEX${stamp}0001` || ev.carrier !== "kerry" || !ev.trackingUrl || !("accessKey" in ev)) throw new Error(`order.shipped payload: ${JSON.stringify(ev)}`);
    return `shipped · trackingUrl ${String(ev.trackingUrl).slice(0, 40)}…`;
  });

  await step("4b complete order", async () => {
    await page.getByRole("button", { name: "เสร็จสิ้น" }).click();
    await toastOrText(page, "ปิดออเดอร์เป็นสำเร็จแล้ว");
    const db = await dbOrderByNumber(tenantId, orderNumber);
    if (db?.order.status !== "completed") throw new Error(`status ${db?.order.status}`);
  });

  await step("4c print page renders", async () => {
    await goto(page, `/orders/${orderId}/print`);
    await page.getByText("ผู้รับ").first().waitFor();
    await page.getByText(orderNumber).first().waitFor();
    if (shots) await page.screenshot({ path: path.join(outDir, "admin-commerce-print-desktop.png"), fullPage: true });
  });

  await step("5 /products/new creates product with 2 variants and publishes", async () => {
    await goto(page, "/products/new");
    await page.fill("#p-name", productName);
    productSlug = (await page.inputValue("#p-slug")).trim();
    if (!productSlug) throw new Error("slug not auto-filled");
    await page.fill("#p-short", "สินค้าทดสอบจากระบบหลังบ้าน");
    await page.fill("#p-desc", "ย่อหน้าแรก\n\nย่อหน้าที่สอง");
    await page.fill("#p-price", "350");
    await page.fill("#p-sku", `QA-${stamp}`);
    await page.getByRole("button", { name: "เพิ่มชุดตัวเลือก" }).click();
    await page.getByPlaceholder(/ไซ/).first().fill("ไซส์");
    const valueInput = page.getByPlaceholder("S, M, L แล้วกด Enter");
    await valueInput.fill("S, M");
    await valueInput.press("Enter");
    await page.getByLabel("สต็อก S").waitFor({ timeout: 10_000 });
    await page.getByLabel("สต็อก S").fill("5");
    await page.getByLabel("สต็อก M").fill("7");
    await page.getByRole("button", { name: "บันทึกและเผยแพร่" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    productId = page.url().split("/").pop()!;
    const db = await withTenant(getDb(), tenantId, async (tx) => {
      const [p] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.slug, productSlug))).limit(1);
      return p;
    });
    if (!db) throw new Error("product not in DB");
    if (db.status !== "active" || !db.hasVariants) throw new Error(`status=${db.status} hasVariants=${db.hasVariants}`);
    if (!db.description?.includes("<p>")) throw new Error(`description not HTML: ${db.description}`);
    return `slug ${productSlug} · ${db.options.length} option(s)`;
  });

  await step("5b product appears on storefront /products and detail page", async () => {
    const web = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const wp = await web.newPage();
    try {
      await wp.goto(`http://${slug}.localhost:${webPort}/products?q=${encodeURIComponent("QA เสื้อยืดทดสอบ")}`, { waitUntil: "networkidle", timeout: 120_000 });
      let found = (await wp.getByText(productName, { exact: false }).count()) > 0;
      if (!found) {
        await wp.goto(`http://${slug}.localhost:${webPort}/products?sort=newest`, { waitUntil: "networkidle", timeout: 120_000 });
        found = (await wp.getByText(productName, { exact: false }).count()) > 0;
      }
      await wp.goto(`http://${slug}.localhost:${webPort}/products/${encodeURIComponent(productSlug)}`, { waitUntil: "networkidle", timeout: 120_000 });
      const detail = (await wp.getByText(productName, { exact: false }).count()) > 0;
      const hasS = (await wp.getByText("S", { exact: true }).count()) > 0;
      if (!detail) throw new Error("detail page missing product name");
      return `listing ${found ? "found" : "NOT in first page"} · detail ok · variant chip S ${hasS ? "shown" : "not detected"}`;
    } finally {
      await web.close();
    }
  });

  await step("5c products list: search + bulk hide/publish", async () => {
    await goto(page, `/products?q=QA-${stamp}`);
    const row = page.locator("table tbody tr").first();
    await row.waitFor({ timeout: 15_000 });
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: "ซ่อน" }).click();
    await toastOrText(page, "ซ่อน 1 รายการแล้ว");
    await goto(page, `/products?q=QA-${stamp}&status=draft`);
    await page.locator("table tbody tr").first().getByRole("checkbox").check();
    await page.getByRole("button", { name: "เผยแพร่" }).first().click();
    await toastOrText(page, "เผยแพร่ 1 รายการแล้ว");
  });

  await step("5d categories page + inline create", async () => {
    await goto(page, "/products/categories");
    await page.getByRole("heading", { name: "หมวดหมู่สินค้า" }).waitFor();
    await page.getByRole("button", { name: "เพิ่มหมวดหมู่" }).click();
    await page.fill("#cat-name", `QA หมวด ${stamp}`);
    await (await dialogButton(page, "บันทึก")).click();
    await toastOrText(page, "สร้างหมวดหมู่แล้ว");
  });

  await step("6 /discounts create percent code", async () => {
    await goto(page, "/discounts/new");
    await page.fill("#d-code", couponCode);
    await page.fill("#d-name", "QA ส่วนลดทดสอบ");
    await page.fill("#d-value", "10");
    await page.fill("#d-min", "500");
    await page.getByRole("button", { name: "สร้างคูปอง" }).click();
    await page.waitForURL(/\/discounts$/, { timeout: 30_000 });
    await page.getByText(couponCode).first().waitFor();
    return couponCode;
  });

  await step("7 /shipping create flat method + toggle", async () => {
    await goto(page, "/shipping/new");
    await page.fill("#s-name", `QA ส่งด่วน ${stamp}`);
    await page.fill("#s-amount", "45");
    await page.fill("#s-days", "1 วัน");
    await page.getByRole("button", { name: "เพิ่มวิธีจัดส่ง" }).click();
    await page.waitForURL(/\/shipping$/, { timeout: 30_000 });
    await page.getByText(`QA ส่งด่วน ${stamp}`).waitFor();
  });

  await step("8 slip queue: slip order → attachSlip → /payments approve → order paid", async () => {
    const r = await createManualOrder(page, { payment: "slip", markPaid: false });
    const db = await dbOrderByNumber(tenantId, r.number);
    const pay = db?.payments[0];
    if (!pay || pay.status !== "pending") throw new Error(`payment ${pay?.status}`);
    await writeFile(path.join(outDir, "_qa-slip.png"), PNG_1x1);
    await withTenant(getDb(), tenantId, (tx) => attachSlip(tx, tenantId, pay.id, { url: "/uploads/qa/_qa-slip.png" }, { autoApprove: false }));
    await goto(page, "/payments");
    const card = page.locator("article", { hasText: r.number }).first();
    await card.waitFor({ timeout: 20_000 });
    await card.getByRole("button", { name: "ยืนยัน" }).click();
    await (await dialogButton(page, "ยืนยันชำระ")).click();
    await toastOrText(page, "ยืนยันการชำระเงินแล้ว");
    const after = await dbOrderByNumber(tenantId, r.number);
    if (after?.order.paymentStatus !== "paid") throw new Error(`order paymentStatus ${after?.order.paymentStatus}`);
    if (after.payments[0]?.verifiedBy === "auto" || !after.payments[0]?.verifiedBy) throw new Error(`verifiedBy ${after.payments[0]?.verifiedBy}`);
    return `${r.number} paid · verifiedBy user`;
  });

  await step("8b /payments paid tab lists it; order verify tab in /orders works", async () => {
    await goto(page, "/payments?tab=paid");
    await page.locator("article").first().waitFor({ timeout: 15_000 });
    await goto(page, "/orders?tab=verify");
    await page.getByRole("heading", { name: "ออเดอร์" }).first().waitFor();
  });

  await step("9 /reviews renders", async () => {
    await goto(page, "/reviews");
    await page.getByRole("heading", { name: "รีวิว" }).first().waitFor();
    const pending = await page.locator("article").count();
    if (pending > 0) {
      await page.locator("article").first().getByRole("button", { name: "อนุมัติ" }).click();
      await toastOrText(page, "อนุมัติรีวิวแล้ว");
      return "approved first pending review";
    }
    return "no pending reviews";
  });

  if (shots) {
    const pages: Array<[string, string]> = [
      ["orders", "/orders"],
      ["order-detail", `/orders/${orderId}`],
      ["order-new", "/orders/new"],
      ["products", "/products"],
      ["product-new", "/products/new"],
      ["product-detail", `/products/${productId}`],
      ["categories", "/products/categories"],
      ["discounts", "/discounts"],
      ["discount-new", "/discounts/new"],
      ["shipping", "/shipping"],
      ["shipping-new", "/shipping/new"],
      ["reviews", "/reviews"],
      ["payments", "/payments"],
    ];
    for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
      const sctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce", storageState, locale: "th-TH" });
      const sp = await sctx.newPage();
      for (const [key, p] of pages) {
        await step(`shot ${key} ${name}`, async () => {
          await sp.goto(t(p), { waitUntil: "networkidle", timeout: 120_000 });
          await sp.waitForTimeout(500);
          const file = path.join(outDir, `admin-commerce-${key}-${name}.png`);
          await sp.screenshot({ path: file, fullPage: name === "mobile" || key.endsWith("new") || key === "order-detail", animations: "disabled" });
          const scrollW = await sp.evaluate(() => document.documentElement.scrollWidth);
          if (scrollW > vp.width) throw new Error(`horizontal overflow ${scrollW}px > ${vp.width}px`);
          return path.relative(process.cwd(), file);
        });
      }
      await sctx.close();
    }
  }

  await ctx.close();
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${errors.length ? ` · page errors: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await writeFile(path.join(process.cwd(), "qa", "commerce-admin-journey-results.json"), JSON.stringify({ slug, stamp, results, pageErrors: errors }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
