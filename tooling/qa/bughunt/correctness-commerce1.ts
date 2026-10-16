/**
 * correctness bughunt – commerce payment state machine + coupon rules.
 *  A: customer cancels unpaid order, then uploads a slip to the cancelled payment (storefront HTTP, demo-shop autoApproveSlips=true)
 *  B: paid order fully refunded by admin, then slip re-uploaded → refunded payment re-marked paid
 *  C: guest checkout ignores perCustomerLimit (WELCOME10 limit 1, same phone twice)
 */
import { done, hreq, multipart, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, sql, orders, payments, products, customers, discounts, tenants } from "@rentweb/db";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { addCartItem, applyCoupon, cancelUnpaidOrder, createOrderFromCart, getOrCreateCart, onOrderPaid } from "../../../packages/modules/commerce/src/services/index";
import { refundOrderPayment } from "../../../packages/modules/commerce/src/admin/orders";

registerPaymentHandler("order", onOrderPaid);
const HOST = "http://demo-shop.localhost:3000";
const PRODUCT = "01a14029-0996-762b-99c5-f1ccda07f220"; // ปลอกหมอน stock ~23
const KERRY = "01a14029-0a1d-76dc-8672-4707ad476130".replace("4707ad476130", "4707ad476130");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function uploadSlip(paymentId: string) {
  const m = multipart("slip", "slip.png", "image/png", PNG);
  const r = await hreq("demo-shop.localhost:3000", `/api/payments/${paymentId}/slip`, { method: "POST", headers: { "content-type": m.contentType, "content-length": String(m.body.length) }, body: m.body });
  return { status: r.status, body: r.body.slice(0, 300) };
}

async function placeOrder(t: string, settings: Record<string, unknown>, phone: string, coupon?: string) {
  return tt(t, async (tx) => {
    const { cart } = await getOrCreateCart(tx, t, null);
    const a = await addCartItem(tx, t, cart.id, { productId: PRODUCT, quantity: 1 });
    if (!a.ok) throw new Error("add " + a.error);
    if (coupon) {
      const c = await applyCoupon(tx, t, cart.id, coupon, { customerId: null });
      console.log("  applyCoupon", coupon, c.ok ? "ok amount=" + c.value.amount : "FAIL " + c.error);
    }
    const r = await createOrderFromCart(tx, t, {
      cartToken: cart.token, customer: null, contact: { name: "QA correctness", phone, email: null }, address: { name: "QA", phone, line1: "1 ถ.ทดสอบ", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" },
      shippingMethodId: "01a14029-0a1d-76dc-8672-49f55d69cea6", paymentMethod: "promptpay_qr", settings,
    });
    if (!r.ok) throw new Error("order " + r.error);
    return r.value;
  });
}

async function state(t: string, orderId: string) {
  return tt(t, async (tx) => {
    const [o] = await tx.select({ number: orders.number, status: orders.status, pay: orders.paymentStatus, paidAt: orders.paidAt, coupon: orders.couponCode, customerId: orders.customerId, discount: orders.discountTotal }).from(orders).where(eq(orders.id, orderId));
    const ps = await tx.select({ id: payments.id, status: payments.status, refunded: payments.refundedAmount, amount: payments.amount }).from(payments).where(and(eq(payments.refType, "order"), eq(payments.refId, orderId)));
    const [p] = await tx.select({ stock: products.stock, sold: products.soldCount }).from(products).where(eq(products.id, PRODUCT));
    return { o, ps, p };
  });
}

async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const which = process.argv[2] ?? "ABC";

  if (which.includes("A")) {
    console.log("=== A: cancel then slip upload ===");
    const o = await placeOrder(t, settings, "0899000101");
    console.log("  placed", o.number, "total", o.total, await state(t, o.orderId));
    const c = await tt(t, (tx) => cancelUnpaidOrder(tx, t, o.orderId, { accessKey: o.accessKey }));
    console.log("  cancel", c.ok, JSON.stringify(await state(t, o.orderId)));
    const up = await uploadSlip(o.paymentId);
    console.log("  slip upload after cancel →", up.status, up.body);
    console.log("  AFTER", JSON.stringify(await state(t, o.orderId)));
  }
  if (which.includes("B")) {
    console.log("=== B: paid → full refund → slip re-upload ===");
    const o = await placeOrder(t, settings, "0899000102");
    const up1 = await uploadSlip(o.paymentId);
    console.log("  slip 1 →", up1.status, up1.body);
    const adminId = (await tt(t, (tx) => tx.execute(sql`select user_id from tenant_members where tenant_id=${t} limit 1`)) as any)[0]?.user_id ?? null;
    const rf = await tt(t, (tx) => refundOrderPayment(tx, t, o.orderId, o.paymentId, o.total, "QA refund", { userId: adminId, actorType: "user" }));
    console.log("  refund", JSON.stringify(rf), JSON.stringify(await state(t, o.orderId)));
    const up2 = await uploadSlip(o.paymentId);
    console.log("  slip 2 after refund →", up2.status, up2.body);
    console.log("  AFTER", JSON.stringify(await state(t, o.orderId)));
  }
  if (which.includes("C")) {
    console.log("=== C: guest reuses WELCOME10 (perCustomerLimit=1) ===");
    const phone = "08990" + String(Date.now()).slice(-5);
    const o1 = await placeOrder(t, settings, phone, "WELCOME10");
    const o2 = await placeOrder(t, settings, phone, "WELCOME10");
    const s1 = await state(t, o1.orderId), s2 = await state(t, o2.orderId);
    console.log("  order1", JSON.stringify(s1.o));
    console.log("  order2", JSON.stringify(s2.o));
    const d = await tt(t, (tx) => tx.select({ used: discounts.usedCount, per: discounts.perCustomerLimit }).from(discounts).where(and(eq(discounts.tenantId, t), eq(discounts.code, "WELCOME10"))));
    console.log("  WELCOME10", JSON.stringify(d));
  }
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
