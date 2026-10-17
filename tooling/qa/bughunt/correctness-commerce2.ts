/**
 * correctness bughunt – commerce concurrency (real Postgres, separate connections):
 *  D: coupon maxUses=1 used by two parallel checkouts (different products → no shared row lock)
 *  E: double-submit of the same cart (two parallel createOrderFromCart with one cart token)
 *  F: two parallel "add to cart" requests (HTTP) for a stock-2 product → duplicate cart lines → oversell at checkout
 */
import { done, hreq, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, sql, orders, products, discounts, tenants, cartItems, carts } from "@rentweb/db";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { addCartItem, applyCoupon, createOrderFromCart, getOrCreateCart, onOrderPaid } from "../../../packages/modules/commerce/src/services/index";

registerPaymentHandler("order", onOrderPaid);
const PILLOW = "01a14029-0996-762b-99c5-f1ccda07f220";
const BAG = "01a14029-090c-75a9-9996-0ec0ac2fd278";
const KERRY = "01a14029-0a1d-76dc-8672-49f55d69cea6";
const addr = (phone: string) => ({ name: "QA", phone, line1: "1 ถ.ทดสอบ", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" });

async function cartWith(t: string, productId: string, qty = 1, coupon?: string) {
  return tt(t, async (tx) => {
    const { cart } = await getOrCreateCart(tx, t, null);
    const a = await addCartItem(tx, t, cart.id, { productId, quantity: qty });
    if (!a.ok) throw new Error(a.error);
    if (coupon) { const c = await applyCoupon(tx, t, cart.id, coupon); if (!c.ok) throw new Error("coupon " + c.error); }
    return cart.token;
  });
}
function checkout(t: string, settings: Record<string, unknown>, token: string, phone: string) {
  return tt(t, (tx) => createOrderFromCart(tx, t, { cartToken: token, customer: null, contact: { name: "QA conc", phone, email: null }, address: addr(phone), shippingMethodId: KERRY, paymentMethod: "promptpay_qr", settings }))
    .then((r) => (r.ok ? `ok ${r.value.number}` : `fail ${r.code}`), (e) => `throw ${String(e.message).slice(0, 120)}`);
}

async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const which = process.argv[2] ?? "DEF";
  const tag = Date.now().toString(36).toUpperCase().slice(-5);

  if (which.includes("D")) {
    const code = `QACOR${tag}`;
    await tt(t, (tx) => tx.insert(discounts).values({ tenantId: t, code, name: "QA correctness maxUses=1", type: "percent", value: 5, maxUses: 1 }));
    const [a, b] = await Promise.all([cartWith(t, PILLOW, 1, code), cartWith(t, BAG, 1, code)]);
    const res = await Promise.all([checkout(t, settings, a, "0899100001"), checkout(t, settings, b, "0899100002")]);
    const [d] = await tt(t, (tx) => tx.select({ used: discounts.usedCount, max: discounts.maxUses }).from(discounts).where(and(eq(discounts.tenantId, t), eq(discounts.code, code))));
    const n = await tt(t, (tx) => tx.select({ number: orders.number, discount: orders.discountTotal }).from(orders).where(and(eq(orders.tenantId, t), eq(orders.couponCode, code))));
    console.log("=== D maxUses race", code, res, "discount row", JSON.stringify(d), "orders with code", JSON.stringify(n));
    console.log(n.length <= 1 && (d?.used ?? 0) <= 1 ? "PASS COR-06 maxUses=1 coupon used at most once under parallel checkouts" : "FAIL COR-06 bug reproduces");
  }
  if (which.includes("E")) {
    const before = (await tt(t, (tx) => tx.select({ s: products.stock }).from(products).where(eq(products.id, PILLOW))))[0]!.s;
    const tok = await cartWith(t, PILLOW, 2);
    const res = await Promise.all([checkout(t, settings, tok, "0899100003"), checkout(t, settings, tok, "0899100003")]);
    const after = (await tt(t, (tx) => tx.select({ s: products.stock }).from(products).where(eq(products.id, PILLOW))))[0]!.s;
    console.log("=== E double-submit same cart", res, "pillow stock", before, "->", after);
    console.log(res.filter((r) => r.startsWith("ok")).length === 1 && before - after === 2 ? "PASS COR-05 double submit -> one order, stock -2 once" : "FAIL COR-05 bug reproduces");
  }
  if (which.includes("F")) {
    const slug = `qa-cor-stock-${tag.toLowerCase()}`;
    const [p] = await tt(t, (tx) => tx.insert(products).values({ tenantId: t, name: `QA correctness stock2 ${tag}`, slug, status: "active", price: 10000, stock: 2, trackInventory: true, weightGrams: 100 }).returning({ id: products.id }));
    // first request creates the cart + cookie
    const first = await hreq("demo-shop.localhost:3000", "/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: BAG, quantity: 1 }) });
    const cookie = String(first.headers["set-cookie"] ?? "").split(";")[0];
    const body = JSON.stringify({ productId: p!.id, quantity: 2 });
    const rs = await Promise.all([0, 1, 2].map(() => hreq("demo-shop.localhost:3000", "/api/cart", { method: "POST", headers: { "content-type": "application/json", cookie }, body })));
    console.log("=== F parallel add statuses", rs.map((r) => r.status + ":" + r.body.slice(0, 60)));
    const token = decodeURIComponent(cookie.split("=")[1] ?? "");
    const lines = await tt(t, (tx) => tx.select({ id: cartItems.id, q: cartItems.quantity }).from(cartItems).innerJoin(carts, eq(carts.id, cartItems.cartId)).where(and(eq(carts.token, token), eq(cartItems.productId, p!.id))));
    console.log("  cart lines for stock-2 product:", JSON.stringify(lines));
    const r = await checkout(t, settings, token, "0899100004");
    const after = (await tt(t, (tx) => tx.select({ s: products.stock }).from(products).where(eq(products.id, p!.id))))[0]!.s;
    console.log("  checkout", r, "stock 2 ->", after);
    console.log(lines.length <= 1 && after >= 0 ? "PASS COR-04 parallel add-to-cart merges into one line, no oversell" : "FAIL COR-04 bug reproduces");
  }
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
