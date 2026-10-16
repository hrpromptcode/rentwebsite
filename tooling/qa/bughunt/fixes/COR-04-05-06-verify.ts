/**
 * commerce packet — real-Postgres concurrency check for COR-04 / COR-05 / COR-06 (separate connections, real row locks).
 * Run from tooling/: npx tsx qa/bughunt/fixes/COR-04-05-06-verify.ts
 *  D: two parallel checkouts with a maxUses=1 coupon       → exactly one order carries the code, used_count = 1
 *  E: double submit of one cart (2 parallel checkouts)     → one order, the other "empty", stock decremented once
 *  F: 3 parallel POST /api/cart {qty 2} on a stock-2 item  → one line of 2, checkout leaves stock 0 (dev server :3000)
 * Cleans up: cancels the orders it created (restock), archives the QA products, deactivates the QA coupon.
 */
import { done, hreq, tenantIdOf, tt } from "../correctness-lib";
import { and, eq, inArray, cartItems, carts, discounts, orders, products, tenants } from "@rentweb/db";
import { addCartItem, applyCoupon, cancelUnpaidOrder, createOrderFromCart, getOrCreateCart } from "../../../../packages/modules/commerce/src/services/index";

const KERRY_NAME = /kerry/i;
let failures = 0;
const check = (label: string, cond: boolean, extra: unknown = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`, extra);
  if (!cond) failures++;
};

async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const ship = await tt(t, async (tx) => {
    const { shippingMethods } = await import("@rentweb/db");
    const rows = await tx.select().from(shippingMethods).where(and(eq(shippingMethods.tenantId, t), eq(shippingMethods.active, true)));
    return (rows.find((r) => KERRY_NAME.test(r.name) && r.type !== "cod") ?? rows.find((r) => r.type === "flat"))!;
  });
  const tag = Date.now().toString(36).toUpperCase().slice(-5);
  const created: Array<{ orderId: string; accessKey: string }> = [];
  const productIds: string[] = [];
  const addr = (phone: string) => ({ name: "QA", phone, line1: "1 ถ.ทดสอบ", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" });
  const newProduct = async (stock: number) => {
    const [p] = await tt(t, (tx) => tx.insert(products).values({ tenantId: t, name: `QA verify ${tag} s${stock}`, slug: `qa-verify-${tag.toLowerCase()}-${productIds.length}`, status: "active", price: 10000, stock, trackInventory: true, weightGrams: 100 }).returning({ id: products.id }));
    productIds.push(p!.id);
    return p!.id;
  };
  const cartWith = (productId: string, qty: number, coupon?: string) =>
    tt(t, async (tx) => {
      const { cart } = await getOrCreateCart(tx, t, null);
      const a = await addCartItem(tx, t, cart.id, { productId, quantity: qty });
      if (!a.ok) throw new Error(a.error);
      if (coupon) {
        const c = await applyCoupon(tx, t, cart.id, coupon);
        if (!c.ok) throw new Error("coupon " + c.error);
      }
      return cart.token;
    });
  const checkout = (token: string, phone: string) =>
    tt(t, (tx) => createOrderFromCart(tx, t, { cartToken: token, customer: null, contact: { name: "QA verify", phone, email: null }, address: addr(phone), shippingMethodId: ship.id, paymentMethod: "promptpay_qr", settings })).then(
      (r) => {
        if (r.ok) created.push({ orderId: r.value.orderId, accessKey: r.value.accessKey });
        return r.ok ? `ok ${r.value.number}` : `fail ${r.code}`;
      },
      (e) => `throw ${String((e as Error).message).slice(0, 120)}`,
    );
  const stock = async (id: string) => (await tt(t, (tx) => tx.select({ s: products.stock }).from(products).where(eq(products.id, id))))[0]!.s;

  try {
    // D
    const code = `QAV${tag}`;
    await tt(t, (tx) => tx.insert(discounts).values({ tenantId: t, code, name: "QA verify maxUses=1", type: "percent", value: 5, maxUses: 1 }));
    const [pa, pb] = [await newProduct(5), await newProduct(5)];
    const [ca, cb] = await Promise.all([cartWith(pa, 1, code), cartWith(pb, 1, code)]);
    const resD = await Promise.all([checkout(ca, "0899200001"), checkout(cb, "0899200002")]);
    const [d] = await tt(t, (tx) => tx.select({ used: discounts.usedCount }).from(discounts).where(and(eq(discounts.tenantId, t), eq(discounts.code, code))));
    const withCode = await tt(t, (tx) => tx.select({ n: orders.number }).from(orders).where(and(eq(orders.tenantId, t), eq(orders.couponCode, code))));
    check("D maxUses=1: one order with the code, used_count 1, loser told (fail coupon)", d!.used === 1 && withCode.length === 1 && resD.filter((r) => r === "fail coupon").length === 1, { resD, used: d!.used, withCode: withCode.length });

    // E
    const pe = await newProduct(19);
    const te = await cartWith(pe, 2);
    const resE = await Promise.all([checkout(te, "0899200003"), checkout(te, "0899200003")]);
    const se = await stock(pe);
    check("E double submit: one order, other 'empty', stock 19 -> 17", resE.filter((r) => r.startsWith("ok")).length === 1 && resE.includes("fail empty") && se === 17, { resE, stock: se });

    // F (through the dev server)
    const pf = await newProduct(2);
    const first = await hreq("demo-shop.localhost:3000", "/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: pe, quantity: 1 }) });
    const cookie = String(first.headers["set-cookie"] ?? "").split(";")[0]!;
    const body = JSON.stringify({ productId: pf, quantity: 2 });
    const rs = await Promise.all([0, 1, 2].map(() => hreq("demo-shop.localhost:3000", "/api/cart", { method: "POST", headers: { "content-type": "application/json", cookie }, body })));
    const token = decodeURIComponent(cookie.split("=")[1] ?? "");
    const lines = await tt(t, (tx) => tx.select({ q: cartItems.quantity }).from(cartItems).innerJoin(carts, eq(carts.id, cartItems.cartId)).where(and(eq(carts.token, token), eq(cartItems.productId, pf))));
    check("F parallel add: one cart line of 2", lines.length === 1 && lines[0]!.q === 2, { statuses: rs.map((r) => r.status), lines });
    const rf = await checkout(token, "0899200004");
    const sf = await stock(pf);
    check("F checkout: stock 2 -> 0 (never negative)", rf.startsWith("ok") && sf === 0, { rf, stock: sf });
  } finally {
    for (const o of created) await tt(t, (tx) => cancelUnpaidOrder(tx, t, o.orderId, { accessKey: o.accessKey }));
    if (productIds.length) await tt(t, (tx) => tx.update(products).set({ status: "archived" }).where(and(eq(products.tenantId, t), inArray(products.id, productIds))));
    await tt(t, (tx) => tx.update(discounts).set({ active: false }).where(and(eq(discounts.tenantId, t), eq(discounts.code, `QAV${tag}`))));
    console.log(`cleanup: cancelled ${created.length} orders, archived ${productIds.length} products`);
  }
  console.log(failures ? `RESULT: ${failures} FAIL` : "RESULT: ALL PASS");
  await done();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await done();
  process.exit(1);
});
