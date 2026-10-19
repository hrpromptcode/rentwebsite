/**
 * Live check of the top-up review fixes (tooling/qa/bughunt/fixes/topup_review.md) on demo-topup.
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_review-verify.ts
 * RV-03: a guest order whose slip the shop rejected shows "ชำระเงินใหม่" on /topup/<n>?k=; clicking it gives a fresh
 * open payment (panel back, DB payment pending). RV-04/05: approving the late slip of a cancelled order is reported
 * and the admin order page shows the "ต้องคืนเงิน" banner. Test orders are closed again at the end.
 */
import "../../../load-env";
import "../../../../apps/web/src/modules";
import { and, customers, eq, gamePackages, games, getDb, payments, tenants, topupOrders, withTenant, type Tx } from "@rentweb/db";
import { attachSlip, expirePayment, getPayment } from "../../../../packages/core/src/payments";
import { createTopupOrder, renewTopupPayment, topupConfig } from "../../../../packages/modules/topup/src/services";
import { adminApproveSlip, adminCancelOrder, adminMarkRefunded, adminRejectSlip, getAdminTopupOrder } from "../../../../packages/modules/topup/src/admin";
import { ADMIN, OWNER, SLUG, launch, newCtx, stateFor } from "../topup_admin-lib";
import { stableGoto } from "./_dev-stable";

const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579"; // demo-topup
const STORE = "http://demo-topup.localhost:3000";
const actor = { userId: "00000000-0000-4000-8000-0000000000c3", actorType: "user" as const };
const db = getDb();
const tx = <R>(fn: (tx: Tx) => Promise<R>) => withTenant(db, T, fn);
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

async function guestOrder(method: "slip" | "promptpay_qr") {
  return tx(async (t) => {
    const [tenant] = await t.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, T));
    const [pkg] = await t
      .select({ id: gamePackages.id, slug: games.slug, fields: games.fields })
      .from(gamePackages)
      .innerJoin(games, and(eq(games.tenantId, T), eq(games.id, gamePackages.gameId)))
      .where(and(eq(gamePackages.tenantId, T), eq(gamePackages.fulfillment, "manual"), eq(gamePackages.active, true), eq(games.active, true)))
      .limit(1);
    const playerFields: Record<string, string> = {};
    for (const f of pkg!.fields ?? []) playerFields[f.key] = f.type === "select" ? (f.options?.[0] ?? "x") : "123456789";
    const r = await createTopupOrder(t, T, {
      gameSlug: pkg!.slug,
      packageId: pkg!.id,
      playerFields,
      paymentMethod: method,
      contact: "0899517099",
      customer: null,
      ip: null,
      settings: (tenant!.settings ?? {}) as Record<string, unknown>,
      config: topupConfig({ otpRequiredFirstOrder: false, maxOrdersPerHour: 0, walletEnabled: true }),
    });
    if (!r.ok) throw new Error(`create: ${r.code} ${r.error}`);
    return r.value;
  });
}

const created: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- RV-10: lock order payments → order (no deadlock with a concurrent approval) ----------
{
  const c = await guestOrder("slip");
  created.push(c.order.id);
  await tx((t) => attachSlip(t, T, c.payment!.id, { url: "/uploads/qa-review-slip.png" }));
  await tx((t) => adminRejectSlip(t, T, c.order.id, "QA RV-10", actor));
  // T2 = what markPaid does: payment row first, then (handler) the order row – held long enough for T1 to start
  let t1Started = false;
  const t2 = tx(async (t) => {
    await t.select({ id: payments.id }).from(payments).where(and(eq(payments.tenantId, T), eq(payments.id, c.payment!.id))).for("update");
    while (!t1Started) await sleep(20);
    await sleep(400);
    await t.select({ id: topupOrders.id }).from(topupOrders).where(and(eq(topupOrders.tenantId, T), eq(topupOrders.id, c.order.id))).for("update");
    return "t2 ok";
  });
  await sleep(150);
  const t1 = tx(async (t) => {
    t1Started = true;
    const [tenant] = await t.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, T));
    const r = await renewTopupPayment(t, T, c.order.id, { settings: (tenant!.settings ?? {}) as Record<string, unknown> });
    return r.ok ? "t1 renewed" : `t1 ${r.error}`;
  });
  const res = await Promise.allSettled([t2, t1]);
  check("RV-10 concurrent approval-shaped lock + renew: no deadlock", res.every((r) => r.status === "fulfilled"), res.map((r) => (r.status === "fulfilled" ? r.value : String((r as PromiseRejectedResult).reason).slice(0, 120))));
}

const browser = await launch();
try {
  // ---------- RV-03: rejected slip → ชำระเงินใหม่ ----------
  const a = await guestOrder("slip");
  created.push(a.order.id);
  await tx((t) => attachSlip(t, T, a.payment!.id, { url: "/uploads/qa-review-slip.png" }));
  const rej = await tx((t) => adminRejectSlip(t, T, a.order.id, "ยอดเงินไม่ตรง (QA review)", actor));
  check("RV-03 slip rejected", rej.ok);

  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const url = `${STORE}/topup/${a.order.number}?k=${encodeURIComponent(a.accessKey)}`;
  await stableGoto(page, url, "load");
  const body = await page.locator("main").innerText();
  check("RV-03 renew card shown with the reason", body.includes("ร้านตรวจสลิปแล้วไม่ผ่าน") && body.includes("ยอดเงินไม่ตรง (QA review)"));
  const btn = page.getByRole("button", { name: "ชำระเงินใหม่" });
  const box = await btn.boundingBox();
  check("RV-03 button ≥ 44px tall", !!box && box.height >= 44, box);
  await btn.click();
  // same URL after the action's redirect: wait for the re-render instead of the navigation
  const gone = await page
    .getByText("ร้านตรวจสลิปแล้วไม่ผ่าน")
    .waitFor({ state: "detached", timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  check("RV-03 page re-rendered after the action", gone);
  await page.waitForTimeout(500);
  const after = await page.locator("main").innerText();
  check("RV-03 renew card gone after click", !after.includes("ร้านตรวจสลิปแล้วไม่ผ่าน"));
  check("RV-03 key kept in the URL", page.url().includes(`k=${encodeURIComponent(a.accessKey)}`), page.url());
  const fresh = await tx(async (t) => {
    const [o] = await t.select().from(topupOrders).where(and(eq(topupOrders.tenantId, T), eq(topupOrders.id, a.order.id)));
    return { order: o!, payment: await getPayment(t, T, o!.paymentId!), old: await getPayment(t, T, a.payment!.id) };
  });
  check("RV-03 new open payment on the order", fresh.order.paymentId !== a.payment!.id && fresh.payment?.status === "pending" && fresh.old?.status === "cancelled", { pay: fresh.payment?.status, old: fresh.old?.status, order: fresh.order.status });
  check("RV-03 payment panel back (slip upload offered)", /แนบสลิป|อัปโหลดสลิป|สลิป/.test(after) && fresh.order.status === "pending_payment");
  await page.screenshot({ path: "screenshots/topup-review-renew-390.png", fullPage: false });
  await ctx.close();

  // ---------- RV-04 / RV-05: late money for a cancelled order ----------
  const b = await guestOrder("promptpay_qr");
  created.push(b.order.id);
  await tx(async (t) => {
    await t.update(payments).set({ expiresAt: new Date(Date.now() - 3 * 3600_000) }).where(and(eq(payments.tenantId, T), eq(payments.id, b.payment!.id)));
    await expirePayment(t, T, b.payment!.id, { now: new Date() });
  });
  const cancelled = await tx((t) => getAdminTopupOrder(t, T, b.order.id));
  check("RV-04 order cancelled by the expiry", cancelled?.order.status === "cancelled", cancelled?.order.status);
  const appr = await tx((t) => adminApproveSlip(t, T, b.order.id, actor));
  check("RV-04 late approval reports the refund", appr.ok && !!appr.value.refundRequired, appr.ok ? appr.value.refundRequired : appr.error);

  const state = await stateFor(browser, "owner", OWNER.email, OWNER.password);
  const actx = await newCtx(browser, { storageState: state, viewport: { width: 1440, height: 900 } });
  const ap = await actx.newPage();
  await stableGoto(ap, `${ADMIN}/t/${SLUG}/topup/orders/${b.order.id}`, "load");
  const adminText = await ap.locator("main").innerText();
  check("RV-05 admin banner ได้รับเงินแล้วแต่ต้องคืนลูกค้า", adminText.includes("ได้รับเงินแล้วแต่ต้องคืนลูกค้า"));
  check("RV-05 admin offers บันทึกว่าคืนเงินแล้ว", (await ap.getByRole("button", { name: "บันทึกว่าคืนเงินแล้ว" }).count()) === 1);
  await ap.screenshot({ path: "screenshots/topup-review-late-money-1440.png", fullPage: false });
  await actx.close();
  const refunded = await tx((t) => adminMarkRefunded(t, T, b.order.id, { note: "QA review cleanup" }, actor));
  check("RV-05 late money recorded as refunded", refunded.ok && refunded.value.status === "refunded");

  // ---------- RV-01: format rules mirrored in the form; the server's Thai refusal copy reaches the customer ----------
  // genshin gets the template's field JSON for the duration of the check (live rows were seeded before STOREFRONT-12)
  const [genshin] = await tx((t) => t.select({ id: games.id, fields: games.fields }).from(games).where(and(eq(games.tenantId, T), eq(games.slug, "genshin"))));
  const original = genshin!.fields;
  const qaPhone = "0899517088";
  try {
    await tx((t) =>
      t
        .update(games)
        .set({ fields: [{ key: "uid", label: "UID", type: "text", required: true, placeholder: "เช่น 812345678", pattern: String.raw`\d{9,10}`, inputMode: "numeric", hint: "ตัวเลข 9–10 หลัก" }, { key: "server", label: "Server", type: "select", required: true, options: ["Asia", "America", "Europe", "TW/HK/MO"] }] })
        .where(and(eq(games.tenantId, T), eq(games.id, genshin!.id))),
    );
    const sctx = await newCtx(browser, { viewport: { width: 1440, height: 900 } });
    const sp = await sctx.newPage();
    await stableGoto(sp, `${STORE}/account/login?next=%2Fgames%2Fgenshin`, "load");
    await sp.fill("#otp-target", qaPhone);
    await sp.locator('form button[type="submit"]').first().click();
    const codeEl = sp.locator("span.font-mono").first();
    await codeEl.waitFor({ timeout: 90_000 });
    await sp.fill("#otp-code", (await codeEl.innerText()).trim());
    if (await sp.locator("#otp-name").count()) await sp.fill("#otp-name", "QA review RV-01");
    await sp.locator('form button[type="submit"]').first().click();
    await sp.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 90_000 });
    await stableGoto(sp, `${STORE}/games/genshin`, "load");
    const uid = sp.locator("#pf-uid");
    const attrs = await uid.evaluate((el) => ({ pattern: el.getAttribute("pattern"), inputmode: el.getAttribute("inputmode"), describedby: el.getAttribute("aria-describedby") }));
    check("RV-01 UID input mirrors pattern / numeric keypad / hint", attrs.pattern === String.raw`\d{9,10}` && attrs.inputmode === "numeric" && attrs.describedby === "pf-uid-hint", attrs);
    check("RV-01 hint visible under the input", await sp.locator("#pf-uid-hint").isVisible());
    // a crafted / old-browser submit without the client pattern: the server's Thai message names the field
    await uid.evaluate((el) => el.removeAttribute("pattern"));
    await uid.fill("abc123");
    await sp.selectOption("#pf-server", "Asia");
    await sp.locator('button[type="submit"]:visible').last().click();
    const alert = sp.getByText("UID ไม่ถูกต้อง (ตัวเลข 9–10 หลัก)");
    const shown = await alert.first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
    check("RV-01 server refusal shows the field + format copy", shown);
    check("RV-01 the UID input is marked aria-invalid", (await uid.getAttribute("aria-invalid")) === "true");

    // blocked customer → the shop's blocked copy, not "ข้อมูลไม่ถูกต้อง"
    await tx((t) => t.update(customers).set({ blockedAt: new Date() }).where(and(eq(customers.tenantId, T), eq(customers.phone, qaPhone))));
    await uid.fill("812345678");
    await sp.selectOption("#pf-server", "Asia"); // React resets the uncontrolled form after an action
    await sp.locator('button[type="submit"]:visible').last().click();
    // blocking drops the customer's session (getCurrentCustomer → null), so on this OTP-gated shop the refusal is the
    // OTP gate; the service-level customer_blocked copy (guests typing a blocked phone on shops without the gate) is
    // pinned by vitest review-fixes RV-01. Either way: refused, nothing written.
    const refused = await sp.getByText(/ไม่สามารถทำรายการได้|ยืนยันเบอร์โทรด้วย OTP/).first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
    const placed = await tx((t) => t.select({ id: topupOrders.id }).from(topupOrders).where(and(eq(topupOrders.tenantId, T), eq(topupOrders.contact, qaPhone))));
    check("RV-01 blocked customer is refused and no order is written", refused && placed.length === 0, { refused, orders: placed.length });
    await sctx.close();
  } finally {
    await tx((t) => t.update(games).set({ fields: original }).where(and(eq(games.tenantId, T), eq(games.id, genshin!.id))));
    await tx((t) => t.update(customers).set({ blockedAt: null }).where(and(eq(customers.tenantId, T), eq(customers.phone, qaPhone))));
  }
} finally {
  await browser.close();
  // close the QA order that is still open (the renewed slip order)
  for (const id of created) await tx((t) => adminCancelOrder(t, T, id, "QA review cleanup", actor, { allowSlipPending: true })).catch(() => null);
}
console.log(failures ? `FAILURES: ${failures}` : "ALL PASS");
process.exit(failures ? 1 : 0);
