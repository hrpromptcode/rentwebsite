// reverify-repro 2026-10-17: re-synced from tooling/qa/restaurant-journey.ts, which already carries the intended rule
// changes (cart id cookie + localStorage lines, phone-only slip proof never auto-approved, stale bill QR voided by a new
// round, more-times chips, p[role=alert], 127.0.0.1 + Host for Node requests, isolateHmr). Only output paths differ.
import "../../load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium, expect, type APIResponse, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr } from "./fixes/_dev-stable";

/**
 * QA journey for the restaurant deliverable (demo-restaurant / ember) in a real Chromium at 390px.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/restaurant-journey.ts
 * Prints PASS/FAIL per step; failing steps get a screenshot in tooling/screenshots/bughunt-storefront_booking_restaurant-rj-fail-*.png.
 * Requires the web dev server on http://localhost:3000. Read-only apart from the orders/reservations it creates.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../screenshots");
const BASE = "http://demo-restaurant.localhost:3000";
const OTHER = "http://demo-shop.localhost:3000";
const QR = {
  A1: "01a14020-a1-w9ntoj", A2: "01a14020-a2-jr07k6", A3: "01a14020-a3-jtaqtt", A4: "01a14020-a4-vvnnxu",
  A5: "01a14020-a5-15g2go", A6: "01a14020-a6-ez9tkj", A7: "01a14020-a7-c38hft", A8: "01a14020-a8-dubqou",
};
const PHONE = "0812345678";
const RES_PHONE = "0891234567";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const results: Array<{ step: string; ok: boolean; note?: string }> = [];
let shotN = 0;
let currentPage: Page | null = null;
const consoleErrors: string[] = [];

/** thb(satang) renders "฿235" or "฿235.00" (th-TH) – match either. */
const amt = (satang: number) => new RegExp("฿\\s?" + Math.round(satang / 100).toLocaleString("en-US").replace(/,/g, ",?") + "(\\.00)?(?!\\d)");

async function step(name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ step: name, ok: true, note: note ?? undefined });
    console.log(`PASS  ${name}${note ? `  — ${note}` : ""}`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 6).join(" | ").slice(0, 600);
    results.push({ step: name, ok: false, note: msg });
    console.log(`FAIL  ${name}\n      ${msg}`);
    if (currentPage && !currentPage.isClosed()) {
      shotN++;
      const file = path.join(SHOTS, `bughunt-storefront_booking_restaurant-rj-fail-${String(shotN).padStart(2, "0")}.png`);
      await currentPage.screenshot({ path: file, fullPage: false }).catch(() => {});
      console.log(`      screenshot: ${file}`);
    }
  }
}

function track(page: Page, tag: string) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${tag}] ${m.text().slice(0, 220)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message.slice(0, 220)}`));
  page.on("requestfailed", (r) => {
    if (!r.url().includes("line.me")) consoleErrors.push(`[${tag}] request failed: ${r.url().slice(0, 140)}`);
  });
}

async function newCtx(browser: Awaited<ReturnType<typeof chromium.launch>>, tag: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", hasTouch: true, isMobile: true, locale: "th-TH" });
  await isolateHmr(ctx); // other agents' edits make the shared dev server reload every page (HMR churn)
  const page = await ctx.newPage();
  track(page, tag);
  currentPage = page;
  return { ctx, page };
}

const cartBar = (page: Page) => page.locator("[data-rw-cartbar] button");

/**
 * Node-side requests (ctx.request) cannot resolve *.localhost on Windows (getaddrinfo ENOTFOUND), so send them to
 * 127.0.0.1 with the tenant Host header and the context's cookies for the original URL (same as the browser would).
 */
function api(ctx: BrowserContext) {
  const map = async (url: string) => {
    const u = new URL(url);
    const headers: Record<string, string> = { host: u.host };
    const cookies = await ctx.cookies(url);
    if (cookies.length) headers.cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    u.hostname = "127.0.0.1";
    return { url: u.toString(), headers };
  };
  return {
    get: async (url: string): Promise<APIResponse> => {
      const m = await map(url);
      return ctx.request.get(m.url, { headers: m.headers });
    },
    post: async (url: string, opts: { data?: unknown } = {}): Promise<APIResponse> => {
      const m = await map(url);
      return ctx.request.post(m.url, { data: opts.data, headers: m.headers });
    },
  };
}

async function sessionApi(ctx: BrowserContext, token: string) {
  const r = await api(ctx).get(`${BASE}/api/restaurant/session/${token}`);
  return { status: r.status(), json: r.ok() ? ((await r.json()) as { token: string; status: string; orders: Array<{ number: string; total: number }>; total: number; dueTotal: number; payment: null | { id: string; amount: number; status: string; method: string } }) : null };
}

function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const shared: { pickupNumber?: string; cashNumber?: string; tableToken?: string; dineInNumber?: string; menuItemId?: string } = {};

  /* ───────────────────────── 1. /menu ───────────────────────── */
  {
    const { ctx, page } = await newCtx(browser, "menu");
    await step("1.0 /menu loads with Thai heading", async () => {
      const res = await page.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
      if (!res || res.status() !== 200) throw new Error(`status ${res?.status()}`);
      await expect(page.getByRole("heading", { level: 1, name: "เมนู" })).toBeVisible();
    });
    await step("1.1 sticky category tabs (position: sticky, ≥44px, stays pinned after scroll)", async () => {
      const nav = page.getByRole("navigation", { name: "หมวดเมนู" });
      await expect(nav).toBeVisible();
      const pos = await nav.evaluate((el) => getComputedStyle(el).position);
      if (pos !== "sticky") throw new Error(`nav position is ${pos}`);
      const tabs = nav.getByRole("link");
      const n = await tabs.count();
      if (n < 5) throw new Error(`only ${n} tabs`);
      for (let i = 0; i < n; i++) {
        const box = await tabs.nth(i).boundingBox();
        if (!box || box.height < 44) throw new Error(`tab ${i} height ${box?.height}`);
      }
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(400);
      const box = await nav.boundingBox();
      if (!box || box.y < 0 || box.y > 130) throw new Error(`nav y after scroll = ${box?.y}`);
      const active = await nav.locator('[aria-current="true"]').textContent();
      await page.mouse.wheel(0, -5000);
      await page.waitForTimeout(300);
      return `${n} tabs, scroll-spy active="${active?.trim()}", y=${Math.round(box.y)}`;
    });
    await step("1.2 item cards render (14 items, images load, price shown)", async () => {
      const cards = page.locator('button[aria-label*="฿"]');
      await expect(cards.first()).toBeVisible();
      const n = await cards.count();
      if (n < 10) throw new Error(`only ${n} cards`);
      const broken = await page.evaluate(() => Array.from(document.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth === 0 && !!i.getAttribute("src")).map((i) => i.getAttribute("src")?.slice(0, 80)));
      const box = await cards.first().boundingBox();
      return `${n} cards, first card ${Math.round(box?.height ?? 0)}px tall, broken images: ${broken.length}${broken.length ? " " + broken.join(", ") : ""}`;
    });
    await step("1.3 modifier sheet: required spice level blocks add until chosen", async () => {
      await page.getByRole("button", { name: /แกงเขียวหวานไก่บ้าน/ }).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg).toBeVisible();
      await expect(dlg.getByText("ระดับความเผ็ด")).toBeVisible();
      await expect(dlg.getByText("จำเป็น").first()).toBeVisible();
      // the add button is aria-disabled (still tappable) until the required group is chosen; Playwright treats aria-disabled
      // as not actionable, so tap it like a user would with force and expect the required group to be flagged
      const blocked = dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ });
      await expect(blocked).toHaveAttribute("aria-disabled", "true");
      await blocked.click({ force: true });
      await page.waitForTimeout(300);
      await expect(dlg).toBeVisible();
      await expect(dlg.locator("fieldset").first()).toHaveClass(/bg-destructive/);
      if ((await page.locator("[data-rw-cartbar]").count()) > 0) throw new Error("cart bar appeared although required modifier missing");
      await dlg.getByRole("radio", { name: "เผ็ดกลาง" }).click();
      await dlg.getByRole("checkbox", { name: /ไข่ดาว/ }).click();
      const addBtn = dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ });
      await expect(addBtn).toContainText(amt(23500));
      await addBtn.click();
      await expect(dlg).toBeHidden();
    });
    await step("1.4 bottom cart bar shows count 1 / ฿235 after first add", async () => {
      await expect(cartBar(page)).toBeVisible();
      await expect(cartBar(page)).toContainText(amt(23500));
      const label = await cartBar(page).getAttribute("aria-label");
      if (!/\b1 รายการ/.test(label ?? "")) throw new Error(`aria-label: ${label}`);
      const box = await cartBar(page).boundingBox();
      if (!box || box.height < 44) throw new Error(`bar height ${box?.height}`);
    });
    await step("1.5 add second item with modifier → bar shows 2 / ฿555", async () => {
      await page.getByRole("button", { name: /ต้มยำกุ้งแม่น้ำ/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: "เผ็ดน้อย" }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(dlg).toBeHidden();
      await expect(cartBar(page)).toContainText(amt(55500));
      const label = await cartBar(page).getAttribute("aria-label");
      if (!/\b2 รายการ/.test(label ?? "")) throw new Error(`aria-label: ${label}`);
    });
    await step("1.6 cart sheet lists lines with modifiers; browse footer links to /order; cookie set", async () => {
      await cartBar(page).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg.getByText("ออเดอร์ของคุณ")).toBeVisible();
      await expect(dlg.getByText("แกงเขียวหวานไก่บ้าน")).toBeVisible();
      await expect(dlg.getByText(/เผ็ดกลาง · ไข่ดาว/)).toBeVisible();
      await expect(dlg.getByRole("link", { name: /สั่งกลับบ้าน/ })).toHaveAttribute("href", "/order");
      await page.keyboard.press("Escape");
      await expect(dlg).toBeHidden();
      // SBR-011 (intended): the rw_rcart cookie only carries the cart id; the lines live in localStorage under the same id
      const cookie = (await ctx.cookies()).find((c) => c.name === "rw_rcart");
      if (!cookie) throw new Error("rw_rcart cookie missing");
      if (!/^c[a-z0-9]{6,24}$/.test(cookie.value)) throw new Error(`rw_rcart cookie is not a cart id: ${cookie.value.slice(0, 60)}`);
      const stored = (await page.evaluate(() => JSON.parse(localStorage.getItem("rw_rcart") ?? "null"))) as { id: string; items: Array<{ menuItemId: string; qty: number }> } | null;
      if (!stored || stored.id !== cookie.value) throw new Error(`localStorage cart id ${stored?.id} != cookie ${cookie.value}`);
      const items = stored.items;
      if (items.length !== 2) throw new Error(`localStorage cart has ${items.length} lines (expected 2)`);
      shared.menuItemId = items[0]?.menuItemId;
      return `cookie = cart id ${cookie.value}, localStorage has ${items.length} lines`;
    });
    await ctx.close();
  }

  /* ───────────────────────── 2. /t/[qrToken] ───────────────────────── */
  {
    const { ctx, page } = await newCtx(browser, "table");
    let token = "";
    let before = { orders: 0, total: 0 };
    let tableName = "";
    await step("2.0 /t/<qrToken> opens a table session (fresh table: open, no pending bill)", async () => {
      for (const [name, qr] of Object.entries(QR)) {
        const res = await page.goto(`${BASE}/t/${qr}`, { waitUntil: "networkidle" });
        if (!res || res.status() !== 200) throw new Error(`status ${res?.status()} for ${name}`);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(`โต๊ะ ${name}`);
        const code = (await page.getByText(/รหัส\s+\S+/).first().textContent())?.match(/รหัส\s+(\S+)/)?.[1] ?? "";
        const s = await sessionApi(ctx, code);
        if (s.json && s.json.status === "open" && !s.json.payment) {
          token = code;
          tableName = name;
          before = { orders: s.json.orders.length, total: s.json.total };
          break;
        }
      }
      if (!token) throw new Error("no table with a clean open session found");
      shared.tableToken = token;
      await page.waitForTimeout(300);
      const cookie = (await ctx.cookies()).find((c) => c.name === "rw_table");
      if (!cookie || cookie.value !== token) throw new Error(`rw_table cookie ${cookie?.value} != ${token}`);
      return `table ${tableName}, session ${token}, existing rounds ${before.orders}, total ฿${before.total / 100}`;
    });
    await step("2.1 add 2 items at the table (spice level + sweetness) → bar ฿260", async () => {
      await page.getByRole("button", { name: /ผัดกะเพราเนื้อโคขุน/ }).click();
      let dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: /เผ็ดมาก/ }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(dlg).toBeHidden();
      await page.getByRole("button", { name: /ชาไทยเย็น/ }).click();
      dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: "หวานน้อย" }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(dlg).toBeHidden();
      await expect(cartBar(page)).toContainText(amt(26000));
    });
    await step("2.2 ส่งออเดอร์เข้าครัว creates R-xxxx; round history + running total update", async () => {
      await cartBar(page).click();
      const dlg = page.getByRole("dialog");
      await dlg.locator("#guest-name").fill("คุณคิวเอ");
      await dlg.getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
      await expect(dlg.getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20000 });
      const number = (await dlg.textContent())?.match(/R-\d{4,}/)?.[0];
      if (!number) throw new Error("no R- number in confirmation");
      shared.dineInNumber = number;
      await dlg.getByRole("button", { name: "เลือกเมนูต่อ" }).click();
      await expect(dlg).toBeHidden();
      await expect(page.getByText(`รายการที่สั่งแล้ว (${before.orders + 1} รอบ)`)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(number).first()).toBeVisible();
      await expect(page.getByText(/คุณคิวเอ/).first()).toBeVisible();
      await expect(page.getByText("ยอดรวมทั้งโต๊ะ").locator("xpath=following-sibling::p[1]")).toContainText(amt(before.total + 26000));
      if ((await page.locator("[data-rw-cartbar]").count()) > 0) throw new Error("cart bar still visible after send (cart not cleared)");
      return number;
    });
    await step("2.3 second round → (n+2 รอบ), total +฿140", async () => {
      await page.getByRole("button", { name: /ข้าวเหนียวมะม่วง/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(dlg).toBeHidden();
      await cartBar(page).click();
      await page.getByRole("dialog").getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
      await expect(page.getByRole("dialog").getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20000 });
      await page.getByRole("dialog").getByRole("button", { name: "เลือกเมนูต่อ" }).click();
      await expect(page.getByText(`รายการที่สั่งแล้ว (${before.orders + 2} รอบ)`)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("ยอดรวมทั้งโต๊ะ").locator("xpath=following-sibling::p[1]")).toContainText(amt(before.total + 40000));
      await expect(page.getByText(/รอบที่ 2/).first()).toBeVisible();
    });
    await step("2.4 session persists on reload (same code, rounds kept, cookie present)", async () => {
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText(`รหัส ${token}`)).toBeVisible();
      await expect(page.getByText(`รายการที่สั่งแล้ว (${before.orders + 2} รอบ)`)).toBeVisible();
      const cookie = (await ctx.cookies()).find((c) => c.name === "rw_table");
      if (!cookie || cookie.value !== token) throw new Error("rw_table cookie lost");
    });
    await step("2.5 dine-in tracker /orders/r/<R> opens via table cookie (no ?p=)", async () => {
      const res = await page.goto(`${BASE}/orders/r/${shared.dineInNumber}`, { waitUntil: "networkidle" });
      if (!res || res.status() !== 200) throw new Error(`status ${res?.status()}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(shared.dineInNumber!);
      await expect(page.getByText(/ทานที่ร้าน/).first()).toBeVisible();
      await expect(page.getByText("ชำระที่โต๊ะ/เคาน์เตอร์")).toBeVisible();
      await page.goto(`${BASE}/t/${QR[tableName as keyof typeof QR]}`, { waitUntil: "networkidle" });
    });
    await step("2.6 เรียกพนักงาน → toast", async () => {
      await page.getByRole("button", { name: /เรียกพนักงาน/ }).click();
      await expect(page.getByRole("status")).toContainText("แจ้งพนักงานแล้ว", { timeout: 10000 });
    });
    let billAmount = 0;
    await step("2.7 ขอบิล → PromptPay QR panel for the due amount; badge ขอบิลแล้ว", async () => {
      await page.getByRole("button", { name: /ขอบิล/ }).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg.getByText("ยอดที่ต้องชำระ")).toBeVisible();
      await expect(dlg.getByText("ยอดที่ต้องชำระ")).toContainText(amt(before.total + 40000));
      await expect(dlg.getByRole("button", { name: /ชำระที่เคาน์เตอร์/ })).toBeVisible();
      await dlg.getByRole("button", { name: /ชำระด้วย PromptPay/ }).click();
      await expect(dlg.locator('img[alt="PromptPay QR"]')).toBeVisible({ timeout: 15000 });
      await expect(dlg.getByText("แนบสลิปโอนเงิน")).toBeVisible();
      const s = await sessionApi(ctx, token);
      if (!s.json?.payment || s.json.status !== "bill_requested") throw new Error(`session status ${s.json?.status}, payment ${JSON.stringify(s.json?.payment)}`);
      billAmount = s.json.payment.amount;
      await page.keyboard.press("Escape");
      await expect(dlg).toBeHidden();
      await expect(page.getByText("ขอบิลแล้ว").first()).toBeVisible();
      return `payment ${s.json.payment.id} amount ฿${billAmount / 100}`;
    });
    await step("2.8 order another round after the QR bill → bill sheet must show the NEW due amount", async () => {
      await page.getByRole("button", { name: /น้ำตะไคร้ใบเตย/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("radio", { name: "หวานปกติ" }).click();
      await dlg.getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(dlg).toBeHidden();
      await cartBar(page).click();
      await page.getByRole("dialog").getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
      await expect(page.getByRole("dialog").getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20000 });
      await page.getByRole("dialog").getByRole("button", { name: "เลือกเมนูต่อ" }).click();
      await expect(page.getByText(`รายการที่สั่งแล้ว (${before.orders + 3} รอบ)`)).toBeVisible({ timeout: 15000 });
      const s = await sessionApi(ctx, token);
      const due = s.json!.dueTotal;
      await page.getByRole("button", { name: /ขอบิล/ }).click();
      const bill = page.getByRole("dialog");
      await expect(bill.getByText("ยอดที่ต้องชำระ").first()).toBeVisible();
      // COR-07/SBR-005: the new round voided the old QR → the sheet offers a fresh PromptPay bill for the new due
      const fresh = bill.getByRole("button", { name: /ชำระด้วย PromptPay/ });
      if (await fresh.count()) {
        if (!(await fresh.textContent())?.replace(/[,\s]/g, "").includes(Math.round(due / 100).toString())) throw new Error(`PromptPay button does not show the new due ฿${due / 100}: ${await fresh.textContent()}`);
        await fresh.click();
        await expect(bill.locator(".heading-display").first()).toBeVisible({ timeout: 15000 });
      }
      const header = (await bill.getByText("ยอดที่ต้องชำระ").first().locator("xpath=..").textContent()) ?? "";
      const panelAmount = (await bill.locator(".heading-display").first().textContent())?.trim() ?? "(no panel)";
      const regen = await bill.getByRole("button", { name: /ชำระด้วย PromptPay|ชำระที่เคาน์เตอร์/ }).count();
      await page.keyboard.press("Escape");
      const expected = Math.round(due / 100).toLocaleString("en-US");
      if (!panelAmount.replace(/[,\s]/g, "").includes(expected.replace(/,/g, ""))) {
        throw new Error(`stale bill: sheet header says "${header.trim()}" (due ฿${due / 100}) but the QR panel still charges ${panelAmount} (payment created for ฿${billAmount / 100}); no button to regenerate (${regen} buttons)`);
      }
      return `due ฿${due / 100}, panel ${panelAmount}`;
    });
    await step("2.9 slip upload on the table bill → ชำระเงินสำเร็จ → table shows ชำระแล้ว; session API = paid", async () => {
      await page.getByRole("button", { name: /ขอบิล/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
      await expect(dlg.getByText("ชำระเงินสำเร็จ")).toBeVisible({ timeout: 20000 });
      await page.keyboard.press("Escape");
      await expect(page.getByText("ชำระเงินเรียบร้อย ขอบคุณที่มาอุดหนุน")).toBeVisible({ timeout: 15000 });
      const s = await sessionApi(ctx, token);
      if (s.json?.status !== "paid") throw new Error(`session status ${s.json?.status}`);
      const allPaid = s.json.orders.every((o) => (o as { paymentStatus?: string }).paymentStatus === "paid");
      return `session paid; payment covered ฿${billAmount / 100} of total ฿${s.json.total / 100}; all orders marked paid: ${allPaid}`;
    });
    await step("2.10 after paid: ordering/bill/call on this session are refused", async () => {
      const r = await api(ctx).post(`${BASE}/api/restaurant/session/${token}/call`, { data: { kind: "staff" } });
      if (r.status() !== 400) throw new Error(`call staff on paid session → ${r.status()}`);
      await page.reload({ waitUntil: "networkidle" });
      const hasButtons = await page.getByRole("button", { name: /เรียกพนักงาน/ }).count();
      return `call API → 400 as expected; action buttons hidden: ${hasButtons === 0}`;
    });
    await ctx.close();

    // counter bill on another clean table
    const c2 = await newCtx(browser, "table-counter");
    await step("2.11 ขอบิล → ชำระที่เคาน์เตอร์ on a second table (toast + badge)", async () => {
      let picked = "";
      for (const [name, qr] of Object.entries(QR)) {
        await c2.page.goto(`${BASE}/t/${qr}`, { waitUntil: "networkidle" });
        const code = (await c2.page.getByText(/รหัส\s+\S+/).first().textContent())?.match(/รหัส\s+(\S+)/)?.[1] ?? "";
        const s = await sessionApi(c2.ctx, code);
        if (s.json && s.json.status === "open" && !s.json.payment) {
          picked = name;
          break;
        }
      }
      if (!picked) throw new Error("no clean table for counter test");
      await c2.page.getByRole("button", { name: /บัวลอยไข่หวาน/ }).click();
      await c2.page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await cartBar(c2.page).click();
      await c2.page.getByRole("dialog").getByRole("button", { name: /ส่งออเดอร์เข้าครัว/ }).click();
      await expect(c2.page.getByRole("dialog").getByText("ส่งออเดอร์เข้าครัวแล้ว")).toBeVisible({ timeout: 20000 });
      await c2.page.getByRole("dialog").getByRole("button", { name: "เลือกเมนูต่อ" }).click();
      await c2.page.getByRole("button", { name: /ขอบิล/ }).click();
      await c2.page.getByRole("dialog").getByRole("button", { name: /ชำระที่เคาน์เตอร์/ }).click();
      await expect(c2.page.getByRole("dialog").getByText("ขอบิลแล้ว พนักงานกำลังนำบิลไปที่โต๊ะ")).toBeVisible({ timeout: 10000 });
      await c2.page.keyboard.press("Escape");
      await expect(c2.page.getByText("ขอบิลแล้ว").first()).toBeVisible();
      return `table ${picked}`;
    });
    await c2.ctx.close();
  }

  /* ───────────────────────── 3. /order pickup ───────────────────────── */
  {
    const { ctx, page } = await newCtx(browser, "pickup");
    await step("3.0 /order loads (hours badge, tracker link)", async () => {
      const res = await page.goto(`${BASE}/order`, { waitUntil: "networkidle" });
      if (!res || res.status() !== 200) throw new Error(`status ${res?.status()}`);
      await expect(page.getByRole("heading", { level: 1, name: "สั่งกลับบ้าน" })).toBeVisible();
      await expect(page.getByText(/รับได้ \d{2}:\d{2}–\d{2}:\d{2} น\./)).toBeVisible();
      await expect(page.getByRole("link", { name: /ติดตามออเดอร์/ })).toHaveAttribute("href", "/orders/r/lookup");
    });
    await step("3.1 cart → ดำเนินการต่อ → pickup slot + name/phone + PromptPay → tracker", async () => {
      await page.getByRole("button", { name: /หมูสะเต๊ะสูตรคุณยาย/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await expect(cartBar(page)).toContainText(amt(16000));
      await cartBar(page).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: /ดำเนินการต่อ/ }).click();
      await expect(dlg.getByText("เวลารับอาหาร").first()).toBeVisible();
      const slots = dlg.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio");
      const n = await slots.count();
      if (n < 2) throw new Error(`only ${n} slots`);
      const box = await slots.nth(1).boundingBox();
      if (!box || box.height < 44) throw new Error(`slot height ${box?.height}`);
      await slots.nth(1).click();
      await expect(slots.nth(1)).toHaveAttribute("aria-checked", "true");
      await dlg.locator("#pickup-name").fill("คุณทดสอบ คิวเอ");
      await dlg.locator("#pickup-phone").fill(PHONE);
      await expect(dlg.locator('input[name="paymentMethodPick"][value="promptpay_qr"]')).toBeChecked();
      await dlg.getByRole("button", { name: /ยืนยันสั่งอาหาร/ }).click();
      await page.waitForURL(/\/orders\/r\/R-\d+\?p=/, { timeout: 30000 });
      const number = page.url().match(/R-\d+/)![0];
      shared.pickupNumber = number;
      await expect(page.getByRole("heading", { level: 1 })).toContainText(number);
      await expect(page.getByText("รอชำระเงิน")).toBeVisible();
      await expect(page.getByText(/เวลารับอาหาร:/)).toBeVisible();
      await expect(page.locator('img[alt="PromptPay QR"]')).toBeVisible();
      await expect(page.getByText("ยอดที่ต้องชำระ")).toBeVisible();
      const cookie = (await ctx.cookies()).find((c) => c.name === "rw_rcart" && c.value);
      return `${number}, cart cookie cleared: ${!cookie}`;
    });
    // intended rule (payments packet): a pickup tracker opened with ?p=<phone> is a phone-only proof — the slip is accepted
    // but never auto-approved (even with DEV_AUTO_APPROVE_SLIPS); the shop verifies it in admin.
    await step("3.2 upload slip (phone-only proof) → รอตรวจสอบ, not auto-approved; API payment pending_verification", async () => {
      await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByText("ได้รับสลิปแล้ว รอตรวจสอบ")).toBeVisible({ timeout: 20000 });
      if ((await page.getByText("ชำระเงินสำเร็จ").count()) > 0) throw new Error("phone-only proof auto-approved the slip");
      if ((await page.locator('img[alt="PromptPay QR"]').count()) > 0) throw new Error("QR still shown after the slip was sent");
      const r = await api(ctx).get(`${BASE}/api/restaurant/orders/${shared.pickupNumber}?p=${PHONE}`);
      const j = (await r.json()) as { paymentStatus: string; status: string; payment: { status: string } | null };
      if (j.paymentStatus === "paid") throw new Error("API paymentStatus=paid after a phone-only slip");
      if (j.payment?.status !== "pending_verification") throw new Error(`API payment.status=${j.payment?.status} (expected pending_verification)`);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText("ได้รับสลิปแล้ว รอตรวจสอบ")).toBeVisible({ timeout: 15000 });
      return `order ${j.status}, paymentStatus=${j.paymentStatus}, payment=${j.payment?.status}; still รอตรวจสอบ after reload`;
    });
    await step("3.3 cash option creates the order without a QR (ชำระเมื่อมารับ)", async () => {
      await page.goto(`${BASE}/order`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /ปอเปี๊ยะทอดผัก/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await cartBar(page).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: /ดำเนินการต่อ/ }).click();
      await dlg.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio").first().click();
      await dlg.locator("#pickup-name").fill("คุณเงินสด");
      await dlg.locator("#pickup-phone").fill(PHONE);
      await dlg.locator("label", { hasText: "เงินสดเมื่อมารับ" }).click();
      await expect(dlg.locator('input[name="paymentMethodPick"][value="cash"]')).toBeChecked();
      await dlg.getByRole("button", { name: /ยืนยันสั่งอาหาร/ }).click();
      await page.waitForURL(/\/orders\/r\/R-\d+\?p=/, { timeout: 30000 });
      shared.cashNumber = page.url().match(/R-\d+/)![0];
      await expect(page.getByText("ชำระเมื่อมารับ")).toBeVisible();
      if ((await page.locator('img[alt="PromptPay QR"]').count()) > 0) throw new Error("QR shown for cash order");
      if ((await page.getByText("แนบสลิปโอนเงิน").count()) > 0) throw new Error("slip upload shown for cash order");
      return shared.cashNumber;
    });
    await step("3.4 wrong phone is refused; /orders/r/lookup form works", async () => {
      await page.goto(`${BASE}/orders/r/${shared.pickupNumber}?p=0800000000`, { waitUntil: "networkidle" });
      await expect(page.getByText("กรอกเบอร์โทรศัพท์ที่ใช้สั่ง")).toBeVisible();
      if ((await page.getByText("รายการอาหาร").count()) > 0) throw new Error("order details leaked with wrong phone");
      await page.goto(`${BASE}/orders/r/lookup`, { waitUntil: "networkidle" });
      await page.locator("#lookup-n").fill(shared.pickupNumber!.toLowerCase());
      await page.locator("#lookup-p").fill(PHONE);
      await page.getByRole("button", { name: /ติดตามออเดอร์/ }).click();
      await page.waitForURL(new RegExp(`/orders/r/${shared.pickupNumber}\\?p=`), { timeout: 15000 });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(shared.pickupNumber!);
    });
    await ctx.close();
  }

  /* ───────────────────────── 4. /reserve ───────────────────────── */
  {
    const { ctx, page } = await newCtx(browser, "reserve");
    const today = bangkokToday();
    const ymd = addDays(today, 20 + (Math.floor(Date.now() / 1000) % 35));
    const TIME = "19:00";
    const made: string[] = [];
    const reserveUrl = `${BASE}/reserve?date=${ymd}&time=${TIME}&size=4&zone=${encodeURIComponent("สวน")}`;
    await step(`4.0 /reserve: date ${ymd} ${TIME}, party 4 (stepper), zone สวน → availability ok → RS- confirmation`, async () => {
      const res = await page.goto(`${BASE}/reserve`, { waitUntil: "networkidle" });
      if (!res || res.status() !== 200) throw new Error(`status ${res?.status()}`);
      await expect(page.getByRole("heading", { level: 1, name: "จองโต๊ะล่วงหน้า" })).toBeVisible();
      await page.locator("#res-date").fill(ymd);
      // only the first 12 time chips are shown; later ones sit behind "แสดงเวลาอื่น (n)" (intended)
      const timeRadio = page.getByRole("radiogroup", { name: "เวลา" }).getByRole("radio", { name: TIME });
      if (!(await timeRadio.count())) await page.getByRole("button", { name: /แสดงเวลาอื่น/ }).click();
      await timeRadio.click();
      const plus = page.getByRole("group", { name: "จำนวนคน" }).getByRole("button", { name: "เพิ่มจำนวน" });
      const pbox = await plus.boundingBox();
      if (!pbox || pbox.height < 44) throw new Error(`stepper button ${pbox?.height}px`);
      await plus.click();
      await plus.click();
      await expect(page.locator('input[name="partySize"]')).toHaveValue("4");
      await page.getByRole("radiogroup", { name: "โซน" }).getByRole("radio", { name: /สวน/ }).click();
      await expect(page.getByText("ว่าง สามารถจองได้")).toBeVisible({ timeout: 10000 });
      await page.locator("#res-name").fill("คุณจองทดสอบ");
      await page.locator("#res-phone").fill(RES_PHONE);
      await page.getByRole("button", { name: /ยืนยันการจอง/ }).click();
      await page.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 30000 });
      const number = page.url().match(/RS-\d+/)![0];
      made.push(number);
      await expect(page.getByText("จองโต๊ะสำเร็จ")).toBeVisible();
      await expect(page.getByText(number).first()).toBeVisible();
      await expect(page.getByText("4 คน")).toBeVisible();
      await expect(page.getByText("สวน", { exact: true })).toBeVisible();
      await expect(page.getByText(/19:00/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "ยกเลิกการจอง" })).toBeVisible();
      return number;
    });
    await step("4.1 fill the garden zone (4 tables) with 3 more overlapping bookings via ?date&time&size&zone", async () => {
      for (let i = 0; i < 3; i++) {
        await page.goto(reserveUrl, { waitUntil: "networkidle" });
        // the deep-linked time must be visible as the selected chip even when it is past the first 12
        await expect(page.getByRole("radiogroup", { name: "เวลา" }).getByRole("radio", { name: TIME })).toHaveAttribute("aria-checked", "true");
        await expect(page.getByText("ว่าง สามารถจองได้")).toBeVisible({ timeout: 10000 });
        await page.locator("#res-name").fill(`คุณจอง ${i + 2}`);
        await page.locator("#res-phone").fill(RES_PHONE);
        await page.getByRole("button", { name: /ยืนยันการจอง/ }).click();
        await page.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 30000 });
        made.push(page.url().match(/RS-\d+/)![0]);
      }
      return made.join(", ");
    });
    await step("4.2 5th overlapping garden booking: UI shows เต็ม + disabled submit; forced submit rejected by server", async () => {
      await page.goto(reserveUrl, { waitUntil: "networkidle" });
      await expect(page.getByText(/เต็มในช่วงเวลานี้/)).toBeVisible({ timeout: 10000 });
      const btn = page.getByRole("button", { name: /ยืนยันการจอง/ });
      await expect(btn).toBeDisabled();
      await page.locator("#res-name").fill("คุณล้น");
      await page.locator("#res-phone").fill(RES_PHONE);
      await btn.evaluate((b) => b.removeAttribute("disabled"));
      await btn.click();
      // target the form's <p role=alert>: Next's <next-route-announcer> is a second role=alert element
      await expect(page.locator('p[role="alert"]')).toContainText(/เต็ม/, { timeout: 20000 });
      if (!/\/reserve/.test(page.url())) throw new Error(`navigated to ${page.url()}`);
    });
    await step("4.3 availability API: 19:30 garden full (overlap), 20:30 garden free, 19:00 indoor free", async () => {
      const get = async (time: string, zone: string) => (await (await api(ctx).get(`${BASE}/api/restaurant/reservations/availability?date=${ymd}&time=${time}&size=4&zone=${encodeURIComponent(zone)}`)).json()) as { available: boolean; capacity: number; booked: number; remaining: number };
      const a = await get("19:30", "สวน");
      const b = await get("20:30", "สวน");
      const c = await get("19:00", "ในบ้าน");
      if (a.available || a.remaining !== 0) throw new Error(`19:30 garden ${JSON.stringify(a)}`);
      if (!b.available) throw new Error(`20:30 garden ${JSON.stringify(b)}`);
      if (!c.available || c.capacity !== 8) throw new Error(`19:00 indoor ${JSON.stringify(c)}`);
      return `garden cap ${a.capacity} booked ${a.booked}; 20:30 remaining ${b.remaining}; indoor remaining ${c.remaining}`;
    });
    await step("4.4 wrong phone on /reservations/<n> is refused", async () => {
      await page.goto(`${BASE}/reservations/${made[0]}?p=0800000000`, { waitUntil: "networkidle" });
      await expect(page.getByText("กรอกเบอร์โทรศัพท์ที่ใช้จอง")).toBeVisible();
      // the phone prompt itself says "…เพื่อเปิดดูรายละเอียดการจอง", so look for the details heading and the guest's data instead
      if ((await page.getByRole("heading", { name: "รายละเอียดการจอง" }).count()) > 0) throw new Error("reservation details heading shown with wrong phone");
      if ((await page.getByText("คุณจองทดสอบ").count()) > 0) throw new Error("guest name leaked with wrong phone");
    });
    await step("4.5 self-service cancel (two-tap) frees the tables (cleanup of the 4 test bookings)", async () => {
      for (const n of made) {
        await page.goto(`${BASE}/reservations/${n}?p=${RES_PHONE}`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "ยกเลิกการจอง" }).click();
        await page.getByRole("button", { name: "แตะอีกครั้งเพื่อยืนยันยกเลิก" }).click();
        await expect(page.getByText("ยกเลิกแล้ว").first()).toBeVisible({ timeout: 15000 });
      }
      const j = (await (await api(ctx).get(`${BASE}/api/restaurant/reservations/availability?date=${ymd}&time=${TIME}&size=4&zone=${encodeURIComponent("สวน")}`)).json()) as { remaining: number };
      if (j.remaining < 4) throw new Error(`remaining after cancel ${j.remaining}`);
      return `cancelled ${made.length}, garden remaining ${j.remaining}`;
    });
    await ctx.close();
  }

  /* ───────────────────────── 5. APIs + tenant isolation ───────────────────────── */
  {
    const ctx = await browser.newContext();
    currentPage = null;
    await step("5.0 GET /api/restaurant/orders/<n>?p= → 200 DTO; without proof → 404", async () => {
      const ok = await api(ctx).get(`${BASE}/api/restaurant/orders/${shared.pickupNumber}?p=${PHONE}`);
      if (ok.status() !== 200) throw new Error(`status ${ok.status()}`);
      const j = (await ok.json()) as { number: string; items: unknown[]; payment: { status: string } | null };
      if (j.number !== shared.pickupNumber || !Array.isArray(j.items) || !j.items.length) throw new Error(JSON.stringify(j).slice(0, 200));
      const noProof = await api(ctx).get(`${BASE}/api/restaurant/orders/${shared.pickupNumber}`);
      if (noProof.status() !== 404) throw new Error(`no proof → ${noProof.status()}`);
      const cc = ok.headers()["cache-control"];
      return `items=${j.items.length}, payment=${j.payment?.status}, cache-control=${cc}`;
    });
    await step("5.1 GET /api/restaurant/session/<token> → 200 DTO; unknown token → 404", async () => {
      const r = await api(ctx).get(`${BASE}/api/restaurant/session/${shared.tableToken}`);
      if (r.status() !== 200) throw new Error(`status ${r.status()}`);
      const j = (await r.json()) as { token: string; status: string; orders: unknown[]; total: number };
      if (j.token !== shared.tableToken || !j.orders.length) throw new Error(JSON.stringify(j).slice(0, 200));
      const bad = await api(ctx).get(`${BASE}/api/restaurant/session/ZZZZZZ`);
      if (bad.status() !== 404) throw new Error(`unknown token → ${bad.status()}`);
      return `status=${j.status}, orders=${j.orders.length}, total=฿${j.total / 100}`;
    });
    await step("5.2 POST /api/restaurant/cart/price prices server-side; invalid body → 400", async () => {
      const r = await api(ctx).post(`${BASE}/api/restaurant/cart/price`, { data: { items: [{ menuItemId: shared.menuItemId, qty: 2, modifierIds: [] }], type: "pickup" } });
      const j = (await r.json()) as { ok: boolean; error?: string; code?: string; subtotal?: number; total?: number };
      const bad = await api(ctx).post(`${BASE}/api/restaurant/cart/price`, { data: { items: "x" } });
      if (bad.status() !== 400) throw new Error(`invalid → ${bad.status()}`);
      return `status ${r.status()} ok=${j.ok} ${j.ok ? `subtotal ฿${j.subtotal! / 100}` : `error="${j.error}" (${j.code}) – expected: green curry needs the required spice group`}`;
    });
    await step("5.3 tenant isolation: another tenant host cannot read this tenant's order / session / table", async () => {
      const a = await api(ctx).get(`${OTHER}/api/restaurant/orders/${shared.pickupNumber}?p=${PHONE}`);
      const b = await api(ctx).get(`${OTHER}/api/restaurant/session/${shared.tableToken}`);
      const c = await api(ctx).get(`${OTHER}/t/${QR.A1}`);
      const d = await api(ctx).get(`${OTHER}/api/restaurant/reservations/availability?date=2030-01-01&time=19:00`);
      const bad = [a, b, c, d].map((r) => r.status()).filter((s) => s !== 404);
      if (bad.length) throw new Error(`statuses: order ${a.status()}, session ${b.status()}, table page ${c.status()}, availability ${d.status()}`);
      return "all 404";
    });
    await ctx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} steps passed ====`);
  if (consoleErrors.length) {
    console.log(`\nconsole/network errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 25)) console.log("  " + e);
  } else console.log("\nno console errors / failed requests");
  console.log("\nSHARED " + JSON.stringify(shared));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
