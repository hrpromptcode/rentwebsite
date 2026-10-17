/**
 * platform_b4 – ADMIN_B2-04 / -09 / -13 against the real DB and the QA tenants created by the hunter.
 * Every write happens inside a transaction that is rolled back at the end of its check (nothing persists).
 * Run: cd tooling && npx tsx qa/bughunt/fixes/platform_b4-verify.ts
 */
import { done, tenantIdOf, tt } from "../correctness-lib";
import { and, customers, eq, gt, products, shippingMethods, tenantModules, tenants, type Tx } from "@rentweb/db";
import { isCustomerBlocked } from "@rentweb/core/customer";
import { enabledMethods, resolvePromptpayId } from "@rentweb/core/payments";
import { addDays, bookingConfig, bookingDepositMethods, createBooking, getServiceBySlug, getSlotsForDate, listClinicPackages, purchasePackage, toBkkParts, toSlotService, ymdToString } from "../../../../packages/modules/booking/src/services/index";
import { addCartItem, checkoutPaymentMethods, createOrderFromCart, getOrCreateCart } from "../../../../packages/modules/commerce/src/services/index";
import { restaurantPaymentNotice } from "../../../../packages/modules/restaurant/src/services/index";

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};
class Rollback extends Error {}
/** runs fn in a tenant transaction and rolls it back, returning fn's value */
async function dry<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await tt(tenantId, async (tx) => {
      out = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out as T;
}
const settingsOf = async (t: string) => (await tt(t, (tx) => tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t))))[0]!.s as Record<string, unknown>;

async function main() {
  // ---------------- ADMIN_B2-04: new salon without receivers ----------------
  const salon = await tenantIdOf("qa-b2-salon-sppp");
  const salonSettings = await settingsOf(salon);
  check("B2-04 salon has no deposit method", bookingDepositMethods(salonSettings).length === 0, JSON.stringify(enabledMethods(salonSettings)));
  const mc = (await tt(salon, (tx) => tx.select({ c: tenantModules.config }).from(tenantModules).where(and(eq(tenantModules.tenantId, salon), eq(tenantModules.moduleKey, "booking")))))[0]?.c ?? {};
  const config = bookingConfig({ booking: mc as Record<string, unknown> });
  const aroma = (await tt(salon, (tx) => getServiceBySlug(tx, salon, "aroma-90")))!;
  check("B2-04 aroma-90 requires a deposit", aroma.depositRequired && aroma.depositAmount > 0, `deposit ${aroma.depositAmount}`);
  const today = toBkkParts(new Date());
  let slot: { start: string } | null = null;
  for (let i = 2; i < 30 && !slot; i++) {
    const date = ymdToString(addDays(today, i));
    slot = (await tt(salon, (tx) => getSlotsForDate(tx, salon, { service: toSlotService(aroma), date, config }))).find((x) => x.available) ?? null;
  }
  if (!slot) throw new Error("no free aroma-90 slot");
  const r = await dry(salon, (tx) => createBooking(tx, salon, { serviceId: aroma.id, start: slot!.start, customer: { name: "QA B4", phone: "0899997704" } }, { config, settings: salonSettings }));
  check("B2-04 deposit booking created without an impossible payment", r.ok && r.value.payment === null && r.value.booking.depositAmount === 0 && r.value.booking.status === "confirmed", r.ok ? JSON.stringify({ status: r.value.booking.status, deposit: r.value.booking.depositAmount, answers: r.value.booking.answers }) : r.error);
  check("B2-04 booking flagged pay at shop", r.ok && (r.value.booking.answers as Record<string, unknown>).payAtShop === true);

  const clinic = await tenantIdOf("qa-b2-clinic-sppp");
  const clinicSettings = await settingsOf(clinic);
  const pkgs = await tt(clinic, (tx) => listClinicPackages(tx, clinic));
  if (pkgs[0]) {
    const p = await dry(clinic, async (tx) => {
      const [c] = await tx.insert(customers).values({ tenantId: clinic, phone: "0899997705", name: "QA B4" }).returning({ id: customers.id });
      return purchasePackage(tx, clinic, { packageId: pkgs[0]!.id, customer: { id: c!.id, name: "QA B4", phone: "0899997705" }, paymentMethod: "slip", consent: { version: "1.0" } }, { settings: clinicSettings, hnPrefix: "HN" });
    });
    check("B2-04 clinic package purchase refused without receiver", !p.ok && p.error === "payments_unavailable", p.ok ? "ok?!" : p.error);
  } else console.log("SKIP clinic package (none)");

  const rest = await tenantIdOf("qa-b2-rest-sppp");
  const restSettings = await settingsOf(rest);
  check("B2-04 restaurant reservation deposit notice", (restaurantPaymentNotice(restSettings, "reservation") ?? "").includes("ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน"), String(restaurantPaymentNotice(restSettings, "reservation")));
  check("B2-04 restaurant pickup still offers cash (owner enabled it)", restaurantPaymentNotice(restSettings, "pickup") === null);

  // ---------------- ADMIN_B2-09: contact phone is not a PromptPay receiver ----------------
  const shop = await tenantIdOf("qa-b2-shop-sppp");
  const shopSettings = await settingsOf(shop);
  const pay = (shopSettings.payments ?? {}) as Record<string, unknown>;
  const withoutId = { ...shopSettings, payments: { ...pay, promptpayId: undefined, bankAccounts: [] } };
  for (const phone of ["02-123-4567", "089-999-0005"]) {
    const s = { ...withoutId, contact: { ...(shopSettings.contact as object), phone } };
    check(`B2-09 contact phone ${phone} alone does not enable PromptPay`, resolvePromptpayId(s) === null && !checkoutPaymentMethods(s).includes("promptpay_qr"), JSON.stringify(checkoutPaymentMethods(s)));
  }
  check("B2-09 explicit PromptPay ID still works", resolvePromptpayId(shopSettings) === "0899990006");

  // ---------------- ADMIN_B2-13: blocked customer guest checkout ----------------
  const [prod] = await tt(shop, (tx) => tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, shop), eq(products.status, "active"), eq(products.hasVariants, false), gt(products.stock, 0))).limit(1));
  const [ship] = await tt(shop, (tx) => tx.select({ id: shippingMethods.id }).from(shippingMethods).where(and(eq(shippingMethods.tenantId, shop), eq(shippingMethods.active, true))).limit(1));
  const shipId = ship?.id;
  const res = await dry(shop, async (tx) => {
    await tx.insert(customers).values({ tenantId: shop, phone: "0899997713", email: "qa.b4.blocked@example.com", name: "QA B4 blocked", blockedAt: new Date() });
    const blockedByPhone = await isCustomerBlocked(tx, shop, { phone: "089-999-7713" });
    const { cart } = await getOrCreateCart(tx, shop, null, null);
    const a = await addCartItem(tx, shop, cart.id, { productId: prod!.id, quantity: 1 });
    if (!a.ok) throw new Error(a.error);
    const address = { name: "QA", phone: "0899997713", line1: "1 ถนน", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" };
    const order = await createOrderFromCart(tx, shop, { cartToken: cart.token, customer: null, contact: { name: "QA", phone: "089-999-7713", email: null }, address, shippingMethodId: shipId!, paymentMethod: "promptpay_qr", settings: shopSettings });
    return { blockedByPhone, order };
  });
  check("B2-13 blocked customer found by guest phone", res.blockedByPhone);
  check("B2-13 guest checkout with blocked phone refused politely", !res.order.ok && res.order.code === "customer_blocked", res.order.ok ? "order created!" : `${res.order.code}: ${res.order.error}`);

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  await done();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => {
  console.error("FATAL", e);
  await done();
  process.exit(1);
});
