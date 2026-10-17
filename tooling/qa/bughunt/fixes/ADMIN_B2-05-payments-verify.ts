/**
 * ADMIN_B2-05 + platform_b4 storefront follow-ups (web_final packet), on the admin_b2 trial tenants with their payment
 * settings temporarily emptied ("owner configured nothing"); everything is restored afterwards.
 *  commerce  checkout says the shop has not set up payments (never blames the shipping method); with COD available the
 *            COD delivery is pre-selected and the other options point to it.
 *  booking   review step shows the pay-at-shop notice instead of "ชำระตอนนี้ (มัดจำ)"; service page says so too;
 *            L.errors has customer_blocked (= CUSTOMER_BLOCKED_MESSAGE) and payments_unavailable.
 *  account   OTP login of a blocked customer shows OTP_VERIFY_ERROR_MESSAGES.blocked (not "รหัสไม่ถูกต้อง").
 *  restaurant /order shows restaurantPaymentNotice(pickup) above a browse-only menu; /reserve (deposit on) shows the
 *            reservation notice instead of the form.
 *  clinic    /packages/<id>/buy shows the notice instead of the purchase form when packagePaymentMethods() is empty.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-05-payments-verify.ts
 */
import type { Page } from "@playwright/test";
import { and, customerOtps, customers, desc, eq, services, tenantModules, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { CUSTOMER_BLOCKED_MESSAGE, OTP_VERIFY_ERROR_MESSAGES } from "@rentweb/core/customer";
import { sha256 } from "@rentweb/core/crypto";
import { restaurantPaymentNotice } from "../../../../packages/modules/restaurant/src/services/payment-options";
import { L as BL } from "../../../../packages/modules/booking/src/labels";
import { L as CL } from "../../../../packages/modules/commerce/src/labels";
import { done, hreq, launch, newCtx, rand, readCreds, shot, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra).slice(0, 400) : ""}`);
};
const c = readCreds();
const T = (key: string) => c.tenants.find((t: { key: string }) => t.key === key) as { slug: string; id: string };
const base = (key: string) => `http://${T(key).slug}.localhost:3000`;

// ---- unit
check("booking L.errors.customer_blocked = CUSTOMER_BLOCKED_MESSAGE", BL.errors.customer_blocked === CUSTOMER_BLOCKED_MESSAGE);
check("booking L.errors.payments_unavailable is Thai, not the unknown fallback", !!BL.errors.payments_unavailable && BL.errors.payments_unavailable !== BL.errors.unknown);
check("restaurantPaymentNotice for an empty setup (pickup + reservation)", !!restaurantPaymentNotice({}, "pickup") && !!restaurantPaymentNotice({}, "reservation"));

// ---- settings snapshot / helpers
type Snap = { settings: Record<string, any>; modules: Array<{ moduleKey: string; config: Record<string, unknown> }> };
const snaps = new Map<string, Snap>();
const snapshot = async (key: string) => {
  const id = T(key).id;
  const [row] = await tt(id, (tx) => tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, id)));
  const mods = await tt(id, (tx) => tx.select({ moduleKey: tenantModules.moduleKey, config: tenantModules.config }).from(tenantModules).where(eq(tenantModules.tenantId, id)));
  snaps.set(key, { settings: row!.s as Record<string, any>, modules: mods as Snap["modules"] });
  return snaps.get(key)!;
};
const settle = () => new Promise((r) => setTimeout(r, 3000));
const setPayments = async (key: string, payments: Record<string, unknown>) => {
  const id = T(key).id;
  const s = snaps.get(key) ?? (await snapshot(key));
  await tt(id, (tx) => tx.update(tenants).set({ settings: { ...s.settings, payments } }).where(eq(tenants.id, id)));
  await invalidateTenant(id);
  await settle();
};
const setModuleConfig = async (key: string, moduleKey: string, patch: Record<string, unknown>) => {
  const id = T(key).id;
  const s = snaps.get(key) ?? (await snapshot(key));
  const cur = s.modules.find((m) => m.moduleKey === moduleKey)?.config ?? {};
  await tt(id, (tx) => tx.update(tenantModules).set({ config: { ...cur, ...patch } }).where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleKey, moduleKey))));
  await invalidateTenant(id);
  await settle();
};
const restore = async () => {
  for (const [key, s] of snaps) {
    const id = T(key).id;
    await tt(id, (tx) => tx.update(tenants).set({ settings: s.settings }).where(eq(tenants.id, id)));
    for (const m of s.modules) await tt(id, (tx) => tx.update(tenantModules).set({ config: m.config }).where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleKey, m.moduleKey))));
    await invalidateTenant(id);
  }
};
const text = async (page: Page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

/** OTP login through the real form: request a code, swap the stored hash for a known one, enter it. */
async function otpLogin(page: Page, key: string, email: string, next = "/account") {
  await page.goto(`${base(key)}/account/login?next=${encodeURIComponent(next)}`, { waitUntil: "load", timeout: 120_000 });
  await page.locator("#otp-target").fill(email);
  await page.locator("#otp-target").press("Enter");
  await page.locator("#otp-code").waitFor({ timeout: 60_000 });
  const id = T(key).id;
  const [otp] = await tt(id, (tx) => tx.select({ id: customerOtps.id }).from(customerOtps).where(and(eq(customerOtps.tenantId, id), eq(customerOtps.target, email))).orderBy(desc(customerOtps.createdAt)).limit(1));
  await tt(id, (tx) => tx.update(customerOtps).set({ codeHash: sha256("246810") }).where(eq(customerOtps.id, otp!.id)));
  await page.locator("#otp-code").fill("246810");
  await page.locator("#otp-code").press("Enter");
}

const createdCustomers: Array<{ key: string; id: string }> = [];
const browser = await launch();
try {
  const VPS = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
  const ctxFor = async (vp: { width: number; height: number }) => {
    const ctx = await newCtx(browser, { viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, locale: "th-TH", timezoneId: "Asia/Bangkok" });
    await isolateHmr(ctx);
    return ctx;
  };

  // ---------------- commerce checkout
  for (const [label, payments] of [["COD on, no receiver", { enabled: { cod: true } }], ["nothing enabled", { enabled: { cod: false } }]] as const) {
    await setPayments("shop", payments);
    for (const vp of VPS) {
      const ctx = await ctxFor(vp);
      const page = await ctx.newPage();
      await page.goto(`${base("shop")}/products`, { waitUntil: "load", timeout: 120_000 });
      const href = await page.locator('main a[href^="/products/"]').first().getAttribute("href");
      await page.goto(`${base("shop")}${href}`, { waitUntil: "load" });
      const add = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
      for (let i = 0; i < (await add.count()); i++) if (await add.nth(i).isVisible()) { await add.nth(i).click(); break; }
      await page.waitForTimeout(3000);
      await page.goto(`${base("shop")}/checkout`, { waitUntil: "load" });
      const ok = await page.locator('input[name="shippingMethodId"]').first().waitFor({ state: "attached", timeout: 60_000 }).then(() => true, () => false);
      if (!ok) {
        check(`[${vp.width}] checkout (${label}) reachable`, false, { url: page.url(), text: (await text(page)).slice(0, 300) });
        await page.screenshot({ path: shot(`web_final-checkout-fail-${vp.width}`) });
        await ctx.close();
        continue;
      }
      const radios = page.locator('input[name="shippingMethodId"]');
      const n = await radios.count();
      const payGroup = '[role="group"][aria-label="วิธีชำระเงิน"] input[type="radio"], [role="group"][aria-label="วิธีชำระเงิน"] [role="radio"]';
      const initial = { checked: await radios.evaluateAll((els) => els.findIndex((e) => (e as HTMLInputElement).checked)), payRadios: await page.locator(payGroup).count() };
      const seen: Array<{ shipping: string; notice: string | null; payRadios: number }> = [];
      for (let i = 0; i < n; i++) {
        await radios.nth(i).locator("xpath=..").click();
        await page.waitForTimeout(300);
        const shipping = ((await radios.nth(i).locator("xpath=..").innerText()) || "").split("\n")[0]!;
        const t = await text(page);
        const notice = [CL.noPaymentReceiverUseCod, CL.noPaymentReceiverUsePickup, CL.noPaymentReceiver, CL.noPaymentForShipping].find((m) => t.includes(m)) ?? null;
        const payRadios = await page.locator(payGroup).count();
        seen.push({ shipping, notice, payRadios });
        if (i === 0 && vp.width === 390) await page.screenshot({ path: shot(`web_final-checkout-${payments.enabled.cod ? "cod" : "none"}-390`), fullPage: false });
      }
      const blamesShipping = seen.some((s) => s.notice === CL.noPaymentForShipping);
      check(`[${vp.width}] checkout (${label}) never blames the shipping method`, !blamesShipping, seen);
      if (payments.enabled.cod) {
        const payable = seen.map((s, i) => (s.notice === null && s.payRadios > 0 ? i : -1)).filter((i) => i >= 0);
        check(`[${vp.width}] checkout (${label}): a payable delivery option is pre-selected`, payable.length > 0 && payable.includes(initial.checked) && initial.payRadios > 0, { initial, payable });
        check(`[${vp.width}] checkout (${label}): unpayable options say "not set up" + point to COD/pickup`, seen.filter((s) => s.notice).every((s) => s.notice === CL.noPaymentReceiverUseCod || s.notice === CL.noPaymentReceiverUsePickup), seen);
      } else {
        check(`[${vp.width}] checkout (${label}): every option says the shop has not set up payments`, seen.length > 0 && seen.every((s) => s.notice === CL.noPaymentReceiver), seen);
      }
      await ctx.close();
    }
  }

  // ---------------- booking (salon)
  const salon = T("salon");
  await setPayments("salon", { enabled: {} });
  await setModuleConfig("salon", "booking", { depositEnabled: true });
  const [svc] = await tt(salon.id, (tx) => tx.select({ slug: services.slug, name: services.name, dep: services.depositRequired, amt: services.depositAmount, active: services.active }).from(services).where(and(eq(services.tenantId, salon.id), eq(services.depositRequired, true))).limit(5));
  if (!svc) {
    check("salon has a deposit service", false);
  } else {
    const sp = await hreq(`${salon.slug}.localhost:3000`, `/services/${encodeURIComponent(svc.slug)}`);
    const body = sp.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    check("service page: pay-at-shop notice instead of the deposit note", body.includes(BL.payAtShopNotice) && !body.includes("ชำระมัดจำ ฿"), svc.slug);
    for (const vp of VPS) {
      const ctx = await ctxFor(vp);
      const page = await ctx.newPage();
      await page.goto(`${base("salon")}/book?service=${encodeURIComponent(svc.slug)}`, { waitUntil: "load", timeout: 120_000 });
      const any = page.getByRole("button", { name: /ใครก็ได้ที่ว่าง/ });
      if (await any.isVisible({ timeout: 15_000 }).catch(() => false)) await any.click();
      await page.locator('button[role="gridcell"]:not([aria-disabled]):not(.animate-pulse)').first().waitFor({ timeout: 60_000 });
      const days = (await page.locator('button[role="gridcell"]:not([aria-disabled])').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")))) as string[];
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
      const day = days.find((d) => (Date.parse(d) - Date.parse(today)) / 86400000 >= 3) ?? days[days.length - 1]!;
      await page.locator(`button[role="gridcell"][data-date="${day}"]`).click();
      await page.getByText("กำลังโหลดเวลาว่าง…").waitFor({ state: "hidden" }).catch(() => {});
      const chips = page.locator("button[aria-pressed]").filter({ hasText: /^\d{2}:\d{2}/ }).locator(":scope:not([disabled])");
      await chips.first().waitFor({ timeout: 60_000 });
      await chips.first().click();
      await page.fill("#bk-name", "คิวเอ ชำระที่ร้าน");
      await page.fill("#bk-phone", "0862229911");
      await page.getByRole("button", { name: "ถัดไป" }).click();
      await page.getByText("ตรวจสอบและยืนยันการจอง").first().waitFor({ timeout: 30_000 });
      const notice = page.locator("[data-pay-at-shop]");
      const t = await text(page);
      check(`[${vp.width}] booking review: pay-at-shop notice + badge, no deposit due now / payment picker`, (await notice.isVisible()) && t.includes(BL.payAtShopBadge) && !t.includes(BL.dueNow) && !t.includes(BL.paymentMethod), t.slice(t.indexOf("ตรวจสอบ"), t.indexOf("ตรวจสอบ") + 400));
      const nb = await notice.boundingBox();
      check(`[${vp.width}] notice fits the viewport`, !!nb && nb.x >= 0 && nb.x + nb.width <= vp.width + 0.5, nb);
      await notice.scrollIntoViewIfNeeded();
      await page.screenshot({ path: shot(`web_final-booking-payatshop-${vp.width}`) });
      await ctx.close();
    }
  }

  // ---------------- account: blocked customer OTP
  {
    const email = `qa-wf-blocked-${rand()}@example.com`;
    const [cu] = await tt(T("shop").id, (tx) => tx.insert(customers).values({ tenantId: T("shop").id, email, name: "QA WF Blocked", blockedAt: new Date() }).returning({ id: customers.id }));
    createdCustomers.push({ key: "shop", id: cu!.id });
    const ctx = await ctxFor({ width: 390, height: 844 });
    const page = await ctx.newPage();
    await otpLogin(page, "shop", email);
    await page.getByText(OTP_VERIFY_ERROR_MESSAGES.blocked).first().waitFor({ timeout: 30_000 }).catch(() => {});
    const t = await text(page);
    check("blocked customer: OTP login shows the 'blocked' message, not 'รหัสไม่ถูกต้อง'", t.includes(OTP_VERIFY_ERROR_MESSAGES.blocked) && !t.includes(OTP_VERIFY_ERROR_MESSAGES.invalid), t.slice(0, 300));
    check("blocked customer: no session (still on the login page)", page.url().includes("/account/login"), page.url());
    await ctx.close();
  }

  // ---------------- restaurant
  await setPayments("restaurant", { enabled: { cash: false } });
  await setModuleConfig("restaurant", "restaurant", { pickup: true, reservationDeposit: 200 });
  for (const vp of VPS) {
    const ctx = await ctxFor(vp);
    const page = await ctx.newPage();
    await page.goto(`${base("restaurant")}/order`, { waitUntil: "load", timeout: 120_000 });
    const pickupNotice = restaurantPaymentNotice({}, "pickup")!;
    const t1 = await text(page);
    const addButtons = await page.getByRole("button", { name: /เพิ่ม|ใส่ตะกร้า/ }).count();
    check(`[${vp.width}] /order: pickup payment notice shown, menu still listed`, t1.includes(pickupNotice) && (await page.locator("[data-payment-notice]").isVisible()), { addButtons });
    await page.screenshot({ path: shot(`web_final-order-notice-${vp.width}`) });
    await page.goto(`${base("restaurant")}/reserve`, { waitUntil: "load" });
    const t2 = await text(page);
    check(`[${vp.width}] /reserve (deposit 200, no receiver): notice instead of the form`, t2.includes(restaurantPaymentNotice({}, "reservation")!) && (await page.locator("form").filter({ has: page.locator('input[name="phone"], #res-phone') }).count()) === 0, t2.slice(0, 200));
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`[${vp.width}] /reserve notice: no horizontal overflow`, ovf <= 0, ovf);
    await page.screenshot({ path: shot(`web_final-reserve-notice-${vp.width}`) });
    await ctx.close();
  }

  // ---------------- clinic package buy
  {
    await setPayments("clinic", { enabled: {} });
    const clinic = T("clinic");
    const email = `qa-wf-pkg-${rand()}@example.com`;
    const ctx = await ctxFor({ width: 390, height: 844 });
    const page = await ctx.newPage();
    await page.goto(`${base("clinic")}/packages`, { waitUntil: "load", timeout: 120_000 });
    const buyHref = await page.locator('a[href*="/buy"]').first().getAttribute("href").catch(() => null);
    if (!buyHref) {
      check("clinic has a package to buy", false);
    } else {
      await otpLogin(page, "clinic", email, buyHref);
      await page.waitForURL((u) => u.pathname.endsWith("/buy"), { timeout: 60_000 }).catch(() => {});
      const [cu] = await tt(clinic.id, (tx) => tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, clinic.id), eq(customers.email, email))));
      if (cu) createdCustomers.push({ key: "clinic", id: cu.id });
      await page.locator("[data-payment-notice]").waitFor({ timeout: 30_000 }).catch(() => {});
      const t = await text(page);
      check("[390] package buy: notice instead of the purchase form", t.includes(BL.packagePaymentsNotice) && (await page.locator('form button[type="submit"]').filter({ hasText: /ซื้อ|ชำระ/ }).count()) === 0, page.url());
      await page.screenshot({ path: shot("web_final-package-notice-390") });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await restore();
  for (const cu of createdCustomers) await tt(T(cu.key).id, (tx) => tx.delete(customers).where(and(eq(customers.tenantId, T(cu.key).id), eq(customers.id, cu.id)))).catch((e) => console.log("cleanup customer", String(e).slice(0, 120)));
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
