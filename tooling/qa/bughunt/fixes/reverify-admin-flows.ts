/**
 * reverify-admin (2026-10-17) — hand-scripted admin flows on FRESH tenants made through the real signup + onboarding UI:
 *  A  sign up → onboarding → new shop tenant → Settings > Payments "not ready" → storefront checkout has no online
 *     method → set PromptPay → status "ready" → storefront checkout offers PromptPay
 *  B  page builder: save draft → live page + live title unchanged → preview link (/preview?token=) shows the draft →
 *     publish → live page updated
 *  C  Settings > Domains: add a custom domain → pending + DNS instructions; the storefront does not serve the host
 *  D  ADMIN_B2-04 follow-ups on a fresh salon tenant (no payment receiver): Services page / service form warn that
 *     deposits cannot be received; a deposit booking becomes pay-at-shop and the calendar chip (day + week) and the
 *     booking detail say "ชำระที่ร้าน"; an admin reschedule keeps the flag; after PromptPay is set the warning is gone.
 * Run: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/reverify-admin-flows.ts [--only A,B,C,D]
 * Writes only to the tenants it creates (qa-rv-*), plus one cart / booking there.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { and, asc, bookings, eq, pages, productVariants, products, tenantDomains, tenantMembers, tenantModules, tenants } from "@rentweb/db";
import { paymentSetupStatus } from "@rentweb/core/payments";
import { done, hreq, plat, tt } from "../correctness-lib";
import { isolateHmr, stableGoto } from "./_dev-stable";
import { addDays, bookingConfig, createBooking, getServiceBySlug, getSlotsForDate, toBkkParts, toSlotService, ymdToString } from "../../../../packages/modules/booking/src/services/index";
import { adminReschedule } from "../../../../packages/modules/booking/src/admin/bookings";
import { addCartItem, getOrCreateCart } from "../../../../packages/modules/commerce/src/services/index";

const ADMIN = "http://localhost:3001";
const RAND = Math.random().toString(36).slice(2, 6);
const EMAIL = `qa-rv-${RAND}@example.com`;
const PASS = `QaRv-${RAND}-1234`;
const SHOP = `qa-rv-shop-${RAND}`;
const SALON = `qa-rv-salon-${RAND}`;
const PROMPTPAY = "0812345678";
const only = (() => {
  const i = process.argv.indexOf("--only");
  return i > 0 ? new Set(process.argv[i + 1]!.split(",")) : null;
})();
const shotsDir = path.resolve(process.cwd(), "screenshots");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, info = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  return ok;
}
async function group(key: string, title: string, page: Page | null, fn: () => Promise<void>) {
  if (only && !only.has(key)) return;
  console.log(`\n== ${key} ${title}`);
  try {
    await fn();
  } catch (e) {
    fail++;
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 300);
    let shot = "";
    if (page) {
      shot = path.join(shotsDir, `reverify-admin-${key}-fail.png`);
      await page.screenshot({ path: shot }).catch(() => (shot = ""));
    }
    console.log(`FAIL ${key} crashed — ${msg}${shot ? ` [${shot}]` : ""}`);
  }
}

const tenantBySlug = async (slug: string) => (await plat((tx) => tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)))[0];
const store = (slug: string) => `http://${slug}.localhost:3000`;
const toast = (page: Page, re: RegExp, timeout = 30_000) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ state: "visible", timeout });
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function onboard(page: Page, tplRe: RegExp, name: string, slug: string) {
  await stableGoto(page, `${ADMIN}/onboarding`);
  await page.getByRole("heading", { name: "เว็บของคุณเป็นแบบไหน?" }).waitFor();
  const card = page.locator("button[aria-pressed]").filter({ hasText: tplRe }).first();
  await card.click();
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.locator("#shop-name").fill(name);
  await page.locator("#shop-slug").fill(slug);
  await page.getByText("ว่าง! ใช้ชื่อนี้ได้").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByRole("heading", { name: "เลือกธีมเริ่มต้น" }).waitFor();
  await Promise.all([page.waitForURL(new RegExp(`/t/${slug}/dashboard`), { timeout: 180_000 }), page.getByRole("button", { name: "สร้างเว็บไซต์" }).click()]);
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function setPromptpay(page: Page, slug: string) {
  await stableGoto(page, `${ADMIN}/t/${slug}/settings/payments`);
  await page.locator("#p-id").fill(PROMPTPAY);
  await page.locator("#p-id").blur();
  await page.locator("form").getByRole("button", { name: "บันทึก", exact: true }).click();
  await toast(page, /บันทึก/);
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  /* ------------------------------------------------------------------ A */
  await group("A", "signup → onboarding shop → payments not ready → PromptPay → checkout offers it", page, async () => {
    await stableGoto(page, `${ADMIN}/signup`);
    await page.fill("#name", `QA RV ${RAND}`);
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASS);
    await Promise.all([page.waitForURL(/\/onboarding/, { timeout: 90_000 }), page.getByRole("button", { name: "สร้างบัญชีฟรี" }).click()]);
    check("A1 signup → /onboarding", page.url().includes("/onboarding"), EMAIL);

    await onboard(page, /ร้านค้า/, `QA RV Shop ${RAND}`, SHOP);
    const t = await tenantBySlug(SHOP);
    check("A2 onboarding creates the shop tenant → dashboard", !!t && page.url().includes(`/t/${SHOP}/dashboard`), `${SHOP} ${t?.id ?? "?"}`);
    const settings0 = (t!.settings ?? {}) as Record<string, unknown>;
    check("A3 new tenant starts without a payment receiver", !paymentSetupStatus(settings0).ready, JSON.stringify((settings0 as { payments?: unknown }).payments ?? null).slice(0, 120));

    await stableGoto(page, `${ADMIN}/t/${SHOP}/settings/payments`);
    const card = page.getByTestId("payment-setup-status");
    await card.waitFor();
    check("A4 Settings > Payments status card = not ready", (await card.getAttribute("data-ready")) === "false" && (await card.innerText()).includes("ลูกค้ายังชำระเงินออนไลน์ไม่ได้"), (await card.innerText()).replace(/\s+/g, " ").slice(0, 90));

    // storefront cart (service) + cookie, then the real checkout page
    const tenantId = t!.id;
    const prod = await tt(tenantId, async (tx) => {
      const ps = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, "active"))).orderBy(asc(products.createdAt)).limit(20);
      for (const p of ps) {
        if (!p.hasVariants) return { productId: p.id, variantId: null as string | null };
        const [v] = await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, p.id), eq(productVariants.active, true))).limit(1);
        if (v) return { productId: p.id, variantId: v.id };
      }
      return null;
    });
    if (!check("A5 new shop has a sellable sample product", !!prod)) return;
    const cartToken = await tt(tenantId, async (tx) => {
      const { cart } = await getOrCreateCart(tx, tenantId, null, null);
      const r = await addCartItem(tx, tenantId, cart.id, { productId: prod!.productId, variantId: prod!.variantId, quantity: 1 });
      if (!r.ok) throw new Error(`addCartItem: ${r.error}`);
      return cart.token;
    });
    await ctx.addCookies([{ name: "rw_cart", value: cartToken, domain: `${SHOP}.localhost`, path: "/" }]);
    const sp = await ctx.newPage();
    await stableGoto(sp, `${store(SHOP)}/checkout`);
    const payGroup = sp.getByRole("group", { name: "วิธีชำระเงิน" });
    const before = (await sp.locator("main").innerText()).replace(/\s+/g, " ");
    check("A6 checkout before PromptPay: no PromptPay option, shop-not-set-up notice", !(await payGroup.count()) || !(await payGroup.innerText()).includes("PromptPay"), /ยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน/.test(before) ? "notice shown" : `text: ${before.slice(0, 160)}`);

    await setPromptpay(page, SHOP);
    const t2 = await tenantBySlug(SHOP);
    check("A7 PromptPay saved → core status ready", paymentSetupStatus((t2!.settings ?? {}) as Record<string, unknown>).ready);
    await stableGoto(page, `${ADMIN}/t/${SHOP}/settings/payments`);
    const card2 = page.getByTestId("payment-setup-status");
    const c2 = (await card2.innerText()).replace(/\s+/g, " ");
    check("A8 status card = ready with the PromptPay receiver", (await card2.getAttribute("data-ready")) === "true" && c2.includes("ลูกค้าชำระเงินออนไลน์ได้แล้ว") && /081.?234.?5678/.test(c2), c2.slice(0, 120));

    let offered = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 90_000 && !offered) {
      await stableGoto(sp, `${store(SHOP)}/checkout`);
      offered = (await payGroup.count()) > 0 && (await payGroup.innerText()).includes("PromptPay");
      if (!offered) await sp.waitForTimeout(3000);
    }
    check("A9 storefront checkout offers PromptPay", offered, offered ? `after ${((Date.now() - t0) / 1000).toFixed(0)}s` : "not offered in 90 s");
    await sp.close();
  });

  /* ------------------------------------------------------------------ B */
  await group("B", "page builder: draft → live unchanged → preview shows draft → publish", page, async () => {
    const t = await tenantBySlug(SHOP);
    if (!t) throw new Error("shop tenant missing (run A first)");
    const [home] = await tt(t.id, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, t.id), eq(pages.kind, "home"))).limit(1));
    if (!home) throw new Error("home page missing");
    const heading = `QA RV FAQ ${RAND}`;
    const newTitle = `${home.title} RV${RAND}`;
    await stableGoto(page, `${ADMIN}/t/${SHOP}/pages/${home.id}`);
    await page.getByRole("button", { name: "เพิ่มเซ็กชัน" }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "เพิ่มเซ็กชัน" });
    await dialog.getByLabel("ค้นหาเซ็กชัน").fill("คำถาม");
    await dialog.locator("button").filter({ hasText: "คำถามที่พบบ่อย" }).first().click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator("#f-heading").fill(heading);
    // an FAQ with no items renders nothing on the storefront — add one like admin-journey 5.2
    await page.getByRole("button", { name: "เพิ่มรายการ" }).click();
    await page.locator("#f-items-0-q").fill(`คำถาม RV ${RAND}`);
    await page.locator("#f-items-0-a").fill(`คำตอบ RV ${RAND}`);
    await page.getByLabel("ชื่อหน้า", { exact: true }).first().fill(newTitle);
    await page.getByRole("button", { name: "บันทึกร่าง" }).first().click();
    await toast(page, /บันทึกฉบับร่างแล้ว/);
    const [p1] = await tt(t.id, (tx) => tx.select().from(pages).where(eq(pages.id, home.id)));
    check("B1 draft saved: sections have the FAQ, published sections do not", JSON.stringify(p1!.sections).includes(heading) && !JSON.stringify(p1!.publishedSections ?? []).includes(heading));
    check("B2 draft save keeps the live title (draft in draft_meta)", p1!.title === home.title && JSON.stringify(p1!.draftMeta ?? {}).includes(newTitle), `title="${p1!.title}" draftMeta=${JSON.stringify(p1!.draftMeta).slice(0, 100)}`);
    const live1 = await hreq(`${SHOP}.localhost`, "/");
    check("B3 live storefront unchanged after draft save", live1.status === 200 && !live1.body.includes(heading), `HTTP ${live1.status}`);

    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 60_000 }), page.getByRole("button", { name: "ดูตัวอย่าง" }).click()]);
    await popup.waitForURL(/\/preview\?token=/, { timeout: 60_000 });
    await popup.waitForLoadState("networkidle").catch(() => {});
    const pv = await popup.locator("body").innerText();
    check("B4 preview link /preview?token= shows the draft", pv.includes(heading), popup.url().replace(/token=[^&]+/, "token=…"));
    await popup.close();

    await page.getByRole("button", { name: "เผยแพร่", exact: true }).click();
    await toast(page, /เผยแพร่แล้ว/);
    const [p2] = await tt(t.id, (tx) => tx.select().from(pages).where(eq(pages.id, home.id)));
    check("B5 publish copies sections + title live", JSON.stringify(p2!.publishedSections ?? []).includes(heading) && p2!.title === newTitle && !p2!.draftMeta, `title="${p2!.title}"`);
    let shown = false;
    const t0 = Date.now();
    while (!shown && Date.now() - t0 < 90_000) {
      shown = (await hreq(`${SHOP}.localhost`, "/")).body.includes(heading);
      if (!shown) await new Promise((r) => setTimeout(r, 3000));
    }
    check("B6 live storefront shows the published FAQ", shown, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });

  /* ------------------------------------------------------------------ C */
  await group("C", "custom domain → pending + DNS instructions, not served", page, async () => {
    const t = await tenantBySlug(SHOP);
    if (!t) throw new Error("shop tenant missing (run A first)");
    const host = `qa-rv-${RAND}.example.com`;
    await stableGoto(page, `${ADMIN}/t/${SHOP}/settings/domains`);
    await page.locator("#d-host").fill(host);
    await page.getByRole("button", { name: "เพิ่มโดเมน" }).click();
    const row = page.locator("li:not([data-sonner-toast])").filter({ hasText: host }).first();
    const appeared = await row.waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
    if (!appeared) {
      const toasts = (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
      check("C1 custom domain added on the new (trial) tenant", false, `no row; toasts: ${toasts.slice(0, 200)}`);
      return;
    }
    const text = (await row.innerText()).replace(/\s+/g, " ");
    check("C1 row shows pending status", text.includes("รอตั้งค่า DNS"), text.slice(0, 120));
    check("C2 DNS instructions: TXT _rentweb.<host> = rentweb-verify=… and CNAME", /TXT/.test(text) && text.includes(`_rentweb.${host}`) && /rentweb-verify=/.test(text) && /CNAME/.test(text));
    const [d] = await plat((tx) => tx.select().from(tenantDomains).where(eq(tenantDomains.hostname, host)));
    check("C3 DB row pending / custom / not verified", !!d && d.tenantId === t.id && d.status === "pending" && d.kind === "custom" && !d.verifiedAt, `${d?.status}/${d?.kind}`);
    const served = await hreq(host, "/");
    const own = await hreq(`${SHOP}.localhost`, "/");
    check("C4 storefront does not serve the unverified host", served.status !== 200 || !served.body.includes(`QA RV Shop ${RAND}`), `custom host HTTP ${served.status}; own subdomain HTTP ${own.status}`);
    check("C5 own subdomain still serves the shop", own.status === 200 && own.body.includes(`QA RV Shop ${RAND}`));
    await row.getByRole("button", { name: "ลบ", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ลบโดเมน" }).click();
    await toast(page, /ลบโดเมนแล้ว|ดำเนินการแล้ว/);
    const left = await plat((tx) => tx.select({ id: tenantDomains.id }).from(tenantDomains).where(eq(tenantDomains.hostname, host)));
    check("C6 domain removed (cleanup)", left.length === 0);
  });

  /* ------------------------------------------------------------------ D */
  await group("D", "salon without receiver: services warning, pay-at-shop chip/detail, reschedule keeps flag", page, async () => {
    const me = (await plat((tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SHOP))))[0];
    if (!me) throw new Error("shop tenant missing (run A first — same signed-in owner)");
    await onboard(page, /ซาลอน/, `QA RV Salon ${RAND}`, SALON);
    const t = await tenantBySlug(SALON);
    if (!t) throw new Error("salon tenant not created");
    const settings = (t.settings ?? {}) as Record<string, unknown>;
    check("D0 new salon has no payment receiver", !paymentSetupStatus(settings).ready);
    const mc = (await plat((tx) => tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, t.id), eq(tenantModules.moduleKey, "booking")))))[0]?.c ?? {};
    const config = bookingConfig({ booking: mc as Record<string, unknown> });
    const aroma = await tt(t.id, (tx) => getServiceBySlug(tx, t.id, "aroma-90"));
    if (!aroma) throw new Error("aroma-90 missing");
    check("D1 template service aroma-90 asks for a deposit, deposits on", aroma.depositRequired && aroma.depositAmount > 0 && config.depositEnabled, `deposit ${aroma.depositAmount}`);

    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await stableGoto(page, `${ADMIN}/t/${SALON}/services`);
      const n = page.getByTestId("deposit-setup-notice");
      const ok = (await n.count()) === 1 && (await n.getAttribute("data-waived")) === "true";
      const txt = ok ? (await n.innerText()).replace(/\s+/g, " ") : "";
      check(`D2 services page warns (no receiver → pay at shop) @${w}`, ok && txt.includes("ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน") && /มี \d+ บริการ/.test(txt) && (await n.getByRole("link", { name: "ตั้งค่าช่องทางรับเงิน" }).getAttribute("href")) === `/t/${SALON}/settings/payments`, txt.slice(0, 140));
      check(`D2b services page no horizontal scroll @${w}`, await noHScroll(page));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await stableGoto(page, `${ADMIN}/t/${SALON}/services/${aroma.id}`);
    check("D3 service form shows the warning under the deposit switch", (await page.getByTestId("deposit-setup-notice").count()) === 1);

    // a storefront-equivalent booking (same service function the /api/booking route calls)
    const today = toBkkParts(new Date());
    let slot: { start: string } | null = null;
    let ymd = "";
    for (let i = 2; i < 30 && !slot; i++) {
      ymd = ymdToString(addDays(today, i));
      slot = (await tt(t.id, (tx) => getSlotsForDate(tx, t.id, { service: toSlotService(aroma), date: ymd, config }))).find((x) => x.available) ?? null;
    }
    if (!slot) throw new Error("no free aroma-90 slot");
    const phone = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const r = await tt(t.id, (tx) => createBooking(tx, t.id, { serviceId: aroma.id, start: slot!.start, customer: { name: `QA RV ${RAND}`, phone } }, { config, settings }));
    if (!r.ok) throw new Error(`createBooking: ${r.error}`);
    const bk = r.value.booking;
    check("D4 deposit booking without receiver → confirmed, deposit 0, payAtShop", bk.status === "confirmed" && bk.depositAmount === 0 && (bk.answers as { payAtShop?: boolean }).payAtShop === true && r.value.payment === null, `${bk.number}`);

    await stableGoto(page, `${ADMIN}/t/${SALON}/bookings?date=${ymd}`);
    const chip = page.locator(`[data-testid=booking-chip][data-booking="${bk.number}"]`).first();
    await chip.waitFor({ timeout: 30_000 });
    check("D5 day-calendar chip shows ชำระที่ร้าน", (await chip.getByTestId("pay-at-shop-chip").count()) === 1 && (await chip.getAttribute("title"))!.includes("ชำระที่ร้าน"), (await chip.innerText()).replace(/\s+/g, " "));
    const box = await chip.boundingBox();
    const timeBox = await chip.locator("span").first().locator("span").first().boundingBox();
    check("D5b chip time stays inside the chip", !!box && !!timeBox && timeBox.x + timeBox.width <= box.x + box.width + 1);
    await stableGoto(page, `${ADMIN}/t/${SALON}/bookings?view=week&date=${ymd}`);
    const wl = page.getByTestId("week-list").locator("li").filter({ hasText: `QA RV ${RAND}` }).first();
    check("D6 week list row shows ชำระที่ร้าน", (await wl.getByTestId("pay-at-shop-chip").count()) === 1);

    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await stableGoto(page, `${ADMIN}/t/${SALON}/bookings/${bk.id}`);
      const badge = await page.getByTestId("pay-at-shop-badge").isVisible();
      const card = page.getByTestId("deposit-card");
      const ct = (await card.innerText()).replace(/\s+/g, " ");
      check(`D7 detail: header badge + deposit card say ชำระที่ร้าน @${w}`, badge && (await page.getByTestId("pay-at-shop").isVisible()) && ct.includes("ไม่ได้เก็บมัดจำ") && !ct.includes("บริการนี้ไม่ต้องชำระมัดจำ"), ct.slice(0, 160));
      check(`D7b detail no horizontal scroll @${w}`, await noHScroll(page));
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // admin reschedule keeps the flag (createAdminBooking carries answers.payAtShop)
    let slot2: { start: string } | null = null;
    for (let i = 3; i < 30 && !slot2; i++) {
      const d = ymdToString(addDays(today, i));
      slot2 = (await tt(t.id, (tx) => getSlotsForDate(tx, t.id, { service: toSlotService(aroma), date: d, config }))).find((x) => x.available && x.start !== slot!.start) ?? null;
    }
    if (!slot2) throw new Error("no second slot");
    const owner = (await plat((tx) => tx.select({ id: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, t.id), eq(tenantMembers.role, "owner")))))[0]?.id;
    const rr = await tt(t.id, (tx) => adminReschedule(tx, t.id, bk.id, { start: slot2!.start }, { ...config, minNoticeHours: 0, maxAdvanceDays: 365 }, { userId: owner ?? "00000000-0000-0000-0000-000000000000", actorType: "user" }, { settings }));
    if (!rr.ok) throw new Error(`adminReschedule: ${rr.error}`);
    const [nb] = await tt(t.id, (tx) => tx.select().from(bookings).where(eq(bookings.id, rr.value.id)));
    check("D8 admin reschedule keeps answers.payAtShop", (nb!.answers as { payAtShop?: boolean }).payAtShop === true && nb!.depositAmount === 0, `${bk.number} → ${nb!.number}`);
    await stableGoto(page, `${ADMIN}/t/${SALON}/bookings/${nb!.id}`);
    check("D9 rescheduled booking detail still shows ชำระที่ร้าน", await page.getByTestId("pay-at-shop-badge").isVisible());

    await setPromptpay(page, SALON);
    await stableGoto(page, `${ADMIN}/t/${SALON}/services`);
    check("D10 after PromptPay is set the services warning is gone", (await page.getByTestId("deposit-setup-notice").count()) === 0);
    await stableGoto(page, `${ADMIN}/t/${SALON}/bookings/${nb!.id}`);
    check("D11 existing pay-at-shop booking keeps its label after setup", await page.getByTestId("pay-at-shop-badge").isVisible());
  });

  const own = errors.filter((e) => !/hydrat|ResizeObserver/i.test(e));
  check("Z no uncaught page errors", own.length === 0, own.slice(0, 3).join(" | "));
  await browser.close();
  console.log(`\nSUMMARY ${pass} PASS · ${fail} FAIL · tenants ${SHOP}, ${SALON} · owner ${EMAIL}`);
  await done();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error("crashed:", e);
  await done().catch(() => {});
  process.exit(2);
});
