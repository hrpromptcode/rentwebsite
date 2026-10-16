/** Bug-hunt regressions for the commerce back-office: COR-21, COR-24, COR-32, COR-30, AM-01 (+ refund flags). */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { customers, diningTables, discounts, inventoryMovements, orders, payments, productVariants, products, reservations, restaurantOrders, tableSessions } from "@rentweb/db";
import { createPayment, markPaid, registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { addCartItem, applyCoupon, createOrderFromCart, getOrCreateCart, onOrderPaid, onOrderPaymentClosed, type CreateOrderInput } from "../src/services";
import { cancelOrderAdmin, completeOrder, confirmOrder, discountSchema, getAdminOrder, getAdminProduct, paymentsQueue, productSchema, refHrefFor, refundOrderPayment, saveProduct, shipOrder, stockWrite, type Actor } from "../src/admin";
import { SETTINGS, setupFixture, type Fixture } from "./helpers";

let f: Fixture;
const actor: Actor = { userId: "00000000-0000-7000-8000-000000000001", actorType: "user" };

beforeAll(async () => {
  f = await setupFixture();
  registerPaymentHandler("order", onOrderPaid);
  registerPaymentClosedHandler("order", onOrderPaymentClosed);
});

const address = { name: "สมชาย", phone: "0891234567", line1: "1 ถ.ทดสอบ", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" };

async function newProduct(stock: number, price = 10000) {
  const slug = `a-${Math.random().toString(36).slice(2, 10)}`;
  return f.run(async (tx) => (await tx.insert(products).values({ tenantId: f.tenantId, name: `สินค้า ${slug}`, slug, price, stock, weightGrams: 100, status: "active", publishedAt: new Date() }).returning({ id: products.id }))[0]!.id);
}

async function placeOrder(productId: string, qty: number, over: Partial<CreateOrderInput> & { coupon?: string } = {}) {
  const token = await f.run(async (tx) => {
    const { cart } = await getOrCreateCart(tx, f.tenantId, null);
    const a = await addCartItem(tx, f.tenantId, cart.id, { productId, quantity: qty });
    if (!a.ok) throw new Error(a.error);
    if (over.coupon) {
      const c = await applyCoupon(tx, f.tenantId, cart.id, over.coupon);
      if (!c.ok) throw new Error(c.error);
    }
    return cart.token;
  });
  const r = await f.run((tx) =>
    createOrderFromCart(tx, f.tenantId, { cartToken: token, customer: null, contact: { name: "ลูกค้า", phone: "0891234567" }, address, shippingMethodId: f.ids.shipFlat, paymentMethod: "slip", settings: SETTINGS, ...over }),
  );
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const stockOf = (id: string) => f.run(async (tx) => (await tx.select().from(products).where(eq(products.id, id)))[0]!);
const orderOf = (id: string) => f.run(async (tx) => (await tx.select().from(orders).where(eq(orders.id, id)))[0]!);
const ship = { carrier: "kerry", trackingNumber: "KER123", trackingUrl: null, note: null } as never;

describe("COR-21 server-side order state machine", () => {
  it("no shipping / completing an unpaid pending order, no second shipment", async () => {
    const pid = await newProduct(5);
    const o = await placeOrder(pid, 1);
    expect(await f.run((tx) => shipOrder(tx, f.tenantId, o.orderId, ship, actor))).toMatchObject({ ok: false, code: "state" });
    expect(await f.run((tx) => completeOrder(tx, f.tenantId, o.orderId, actor))).toMatchObject({ ok: false, code: "state" });
    expect((await orderOf(o.orderId)).status).toBe("pending");
    await f.run((tx) => markPaid(tx, f.tenantId, o.paymentId, { verifiedBy: actor.userId }));
    expect((await f.run((tx) => shipOrder(tx, f.tenantId, o.orderId, ship, actor))).ok).toBe(true);
    const again = await f.run((tx) => shipOrder(tx, f.tenantId, o.orderId, ship, actor));
    expect(again).toMatchObject({ ok: false, code: "state" });
    expect(!again.ok && again.error).toMatch(/จัดส่งแล้ว/);
    expect((await f.run((tx) => completeOrder(tx, f.tenantId, o.orderId, actor))).ok).toBe(true);
    const detail = await f.run((tx) => getAdminOrder(tx, f.tenantId, o.orderId));
    expect(detail!.shipments).toHaveLength(1);
  });

  it("pickup orders can be completed from confirmed (hand-over at the counter)", async () => {
    const pid = await newProduct(5);
    const o = await placeOrder(pid, 1, { shippingMethodId: f.ids.shipPickup, address: null });
    expect(await f.run((tx) => completeOrder(tx, f.tenantId, o.orderId, actor))).toMatchObject({ ok: false, code: "state" }); // still pending
    expect((await f.run((tx) => confirmOrder(tx, f.tenantId, o.orderId, actor))).ok).toBe(true);
    expect((await f.run((tx) => completeOrder(tx, f.tenantId, o.orderId, actor))).ok).toBe(true);
    expect(await orderOf(o.orderId)).toMatchObject({ status: "completed", fulfillmentStatus: "picked_up" });
  });
});

describe("COR-24 full refund of an unshipped order", () => {
  it("restocks, releases the coupon and reverses the sales stats; refund after shipping does not restock", async () => {
    await f.run((tx) => tx.insert(discounts).values({ tenantId: f.tenantId, code: "REF5", type: "fixed", value: 500 }));
    const pid = await newProduct(23, 65000);
    const o = await placeOrder(pid, 1, { coupon: "REF5" });
    await f.run((tx) => markPaid(tx, f.tenantId, o.paymentId, { verifiedBy: actor.userId }));
    expect(await stockOf(pid)).toMatchObject({ stock: 22, soldCount: 1 });
    const order = await orderOf(o.orderId);
    const cust = await f.run(async (tx) => (await tx.select().from(customers).where(eq(customers.id, order.customerId!)))[0]!);
    const r = await f.run((tx) => refundOrderPayment(tx, f.tenantId, o.orderId, o.paymentId, o.total, "ลูกค้าเปลี่ยนใจ", actor));
    expect(r).toMatchObject({ ok: true, value: { paymentStatus: "refunded", restocked: 1 } });
    expect(await stockOf(pid)).toMatchObject({ stock: 23, soldCount: 0 });
    expect(await orderOf(o.orderId)).toMatchObject({ status: "refunded", paymentStatus: "refunded" });
    await f.run(async (tx) => {
      const [d] = await tx.select().from(discounts).where(eq(discounts.code, "REF5"));
      expect(d!.usedCount).toBe(0);
      const [c] = await tx.select().from(customers).where(eq(customers.id, order.customerId!));
      expect(c!.ordersCount).toBe(cust.ordersCount - 1);
      const moves = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.refId, o.orderId), eq(inventoryMovements.reason, "release")));
      expect(moves).toHaveLength(1);
    });
    // nothing left to cancel: the release already happened
    expect(await f.run((tx) => cancelOrderAdmin(tx, f.tenantId, o.orderId, null, actor))).toMatchObject({ ok: false, code: "state" });

    // shipped → full refund keeps stock as is (the goods are with the customer)
    const p2 = await newProduct(5);
    const o2 = await placeOrder(p2, 2);
    await f.run((tx) => markPaid(tx, f.tenantId, o2.paymentId, { verifiedBy: actor.userId }));
    await f.run((tx) => shipOrder(tx, f.tenantId, o2.orderId, ship, actor));
    const r2 = await f.run((tx) => refundOrderPayment(tx, f.tenantId, o2.orderId, o2.paymentId, o2.total, null, actor));
    expect(r2).toMatchObject({ ok: true, value: { restocked: 0 } });
    expect((await stockOf(p2)).stock).toBe(3);
  });

  it("an order refunded by the old code (status refunded, never restocked) can still be cancelled to release its stock", async () => {
    const pid = await newProduct(10);
    const o = await placeOrder(pid, 3);
    await f.run((tx) => markPaid(tx, f.tenantId, o.paymentId, { verifiedBy: actor.userId }));
    // simulate the pre-fix refund: payment + order refunded, nothing released
    await f.run(async (tx) => {
      await tx.update(payments).set({ status: "refunded", refundedAmount: o.total }).where(eq(payments.id, o.paymentId));
      await tx.update(orders).set({ status: "refunded", paymentStatus: "refunded" }).where(eq(orders.id, o.orderId));
    });
    const detail = await f.run((tx) => getAdminOrder(tx, f.tenantId, o.orderId));
    expect(detail!.canCancel).toBe(true);
    expect(await f.run((tx) => cancelOrderAdmin(tx, f.tenantId, o.orderId, "คืนสต็อก", actor))).toMatchObject({ ok: true, value: { restocked: 3 } });
    expect((await stockOf(pid)).stock).toBe(10);
    expect((await orderOf(o.orderId)).status).toBe("refunded");
    expect((await f.run((tx) => getAdminOrder(tx, f.tenantId, o.orderId)))!.canCancel).toBe(false);
  });

  it("admin cancel voids open payments with cancelPayment and a late payment shows as refund required", async () => {
    const pid = await newProduct(4);
    const o = await placeOrder(pid, 1);
    expect((await f.run((tx) => cancelOrderAdmin(tx, f.tenantId, o.orderId, "สินค้าหมด", actor))).ok).toBe(true);
    expect((await stockOf(pid)).stock).toBe(4);
    const [pay] = await f.run((tx) => tx.select().from(payments).where(eq(payments.id, o.paymentId)));
    expect(pay!.status).toBe("cancelled");
    // money for the cancelled order arrives on a new slip → flagged, visible in the order detail and the queue
    const late = await f.run((tx) => createPayment(tx, f.tenantId, { refType: "order", refId: o.orderId, amount: o.total, provider: "bank_transfer", method: "slip" }));
    await f.run((tx) => markPaid(tx, f.tenantId, late.id, { verifiedBy: actor.userId }));
    const detail = await f.run((tx) => getAdminOrder(tx, f.tenantId, o.orderId));
    expect(detail!.refundFlags[late.id]).toBeTruthy();
    const q = await f.run((tx) => paymentsQueue(tx, f.tenantId, { tab: "paid", perPage: 100 }));
    expect(q.rows.find((r) => r.id === late.id)!.refundRequired).toBeTruthy();
    // refunding the flagged payment leaves the cancelled order alone
    expect((await f.run((tx) => refundOrderPayment(tx, f.tenantId, o.orderId, late.id, o.total, null, actor))).ok).toBe(true);
    expect((await orderOf(o.orderId)).status).toBe("cancelled");
  });
});

describe("COR-32 saving a product keeps live stock", () => {
  it("stockWrite applies only the user's change", () => {
    expect(stockWrite(7, 10, 10)).toBeNull(); // unchanged field: no write
    expect(stockWrite(7, 12, 10)).toEqual({ next: 9, delta: 2 });
    expect(stockWrite(1, 5, 10)).toEqual({ next: 0, delta: -1 });
    expect(stockWrite(7, 10, undefined)).toBeNull(); // stale form without a baseline never overwrites
    expect(stockWrite(null, 4, undefined)).toEqual({ next: 4, delta: 4 });
  });

  it("price-only save after a sale keeps the sold stock; a stock edit is applied as a delta with a movement", async () => {
    const pid = await newProduct(10, 20000);
    const loaded = (await f.run((tx) => getAdminProduct(tx, f.tenantId, pid)))!;
    const form = {
      name: loaded.product.name,
      slug: loaded.product.slug,
      categoryId: "",
      price: "199",
      status: "active",
      type: "physical",
      trackInventory: true,
      stock: String(loaded.product.stock),
      stockLoaded: String(loaded.product.stock),
      lowStockThreshold: "5",
      weightGrams: "100",
    };
    await placeOrder(pid, 3); // a customer buys 3 while the form is open
    const s1 = await f.run((tx) => saveProduct(tx, f.tenantId, pid, productSchema.parse(form), actor));
    expect(s1).toMatchObject({ ok: true, value: { stock: 7 } });
    expect(await stockOf(pid)).toMatchObject({ stock: 7, price: 19900 });
    // user changes the stock field 10 → 15 in the same stale form: +5 on the live 7
    const s2 = await f.run((tx) => saveProduct(tx, f.tenantId, pid, productSchema.parse({ ...form, stock: "15" }), actor));
    expect(s2).toMatchObject({ ok: true, value: { stock: 12 } });
    const moves = await f.run((tx) => tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.productId, pid), eq(inventoryMovements.reason, "adjustment"))));
    expect(moves.map((m) => m.delta)).toEqual([5]);
  });

  it("variant stock follows the same rule", async () => {
    const loaded = (await f.run((tx) => getAdminProduct(tx, f.tenantId, f.ids.variant)))!;
    const s = loaded.variants.find((v) => v.id === f.ids.variantS)!;
    const variants = loaded.variants.map((v) => ({ id: v.id, title: v.title, optionValues: v.optionValues, sku: v.sku, price: String(v.price / 100), stock: String(v.stock), stockLoaded: String(v.stock), active: v.active }));
    await f.run((tx) => tx.update(productVariants).set({ stock: s.stock - 1 }).where(eq(productVariants.id, s.id))); // sold meanwhile
    const form = { name: loaded.product.name, slug: loaded.product.slug, categoryId: loaded.product.categoryId ?? "", price: "1000", status: "active", type: "physical", trackInventory: true, stock: "0", lowStockThreshold: "5", weightGrams: "300", options: loaded.product.options, variants };
    const r = await f.run((tx) => saveProduct(tx, f.tenantId, f.ids.variant, productSchema.parse(form), actor));
    expect(r.ok).toBe(true);
    const [after] = await f.run((tx) => tx.select().from(productVariants).where(eq(productVariants.id, s.id)));
    expect(after!.stock).toBe(s.stock - 1);
  });
});

describe("COR-30 percent coupons are whole numbers", () => {
  it("rejects 12.5 and 0.4, accepts 13", () => {
    const base = { code: "PCT", type: "percent" };
    expect(discountSchema.safeParse({ ...base, value: "12.5" }).success).toBe(false);
    expect(discountSchema.safeParse({ ...base, value: "0.4" }).success).toBe(false);
    const ok = discountSchema.safeParse({ ...base, value: "13" });
    expect(ok.success && ok.data.value).toBe(13);
    expect(discountSchema.safeParse({ code: "FIX", type: "fixed", value: "12.5" }).success).toBe(true); // baht may have satang
  });
});

describe("AM-01 payments queue links for restaurant payments", () => {
  it("points restaurant orders / reservations at existing admin pages and labels table bills", async () => {
    const at = new Date("2026-10-16T18:30:00Z"); // 01:30 on the 17th in Bangkok
    expect(refHrefFor("rest_order", "x", { number: "R-1001", at })).toBe("/restaurant/orders?tab=history&from=2026-10-17&to=2026-10-17&q=R-1001");
    expect(refHrefFor("reservation", "x", { at })).toBe("/restaurant/reservations?date=2026-10-17");
    expect(refHrefFor("rest_order", "x")).toBe("/restaurant/orders");

    const ids = await f.run(async (tx) => {
      const [table] = await tx.insert(diningTables).values({ tenantId: f.tenantId, name: "A3", qrToken: `q-${Math.random().toString(36).slice(2)}` } as never).returning({ id: diningTables.id });
      const [session] = await tx.insert(tableSessions).values({ tenantId: f.tenantId, tableId: table!.id, token: `t-${Math.random().toString(36).slice(2)}`, status: "paid", openedAt: at }).returning({ id: tableSessions.id });
      const [ro] = await tx.insert(restaurantOrders).values({ tenantId: f.tenantId, number: "R-1001", type: "pickup", placedAt: at } as never).returning({ id: restaurantOrders.id });
      const [rs] = await tx.insert(reservations).values({ tenantId: f.tenantId, number: "RS-1001", name: "คุณบี", phone: "0811111111", partySize: 2, startsAt: at, endsAt: new Date(at.getTime() + 2 * 3600_000) } as never).returning({ id: reservations.id });
      for (const [refType, refId] of [["rest_order", session!.id], ["rest_order", ro!.id], ["reservation", rs!.id]] as const) {
        const p = await createPayment(tx, f.tenantId, { refType, refId, amount: 1000, provider: "promptpay", method: "promptpay_qr" });
        await tx.update(payments).set({ status: "pending_verification" }).where(eq(payments.id, p.id));
      }
      return { session: session!.id, ro: ro!.id, rs: rs!.id };
    });
    const q = await f.run((tx) => paymentsQueue(tx, f.tenantId, { tab: "pending_verification", perPage: 100 }));
    const by = (refId: string) => q.rows.find((r) => r.refId === refId)!;
    expect(by(ids.session)).toMatchObject({ refNumber: "บิลโต๊ะ A3", refHref: "/restaurant/orders?tab=history&from=2026-10-17&to=2026-10-17" });
    expect(by(ids.ro)).toMatchObject({ refNumber: "R-1001", refHref: "/restaurant/orders?tab=history&from=2026-10-17&to=2026-10-17&q=R-1001" });
    expect(by(ids.rs)).toMatchObject({ refNumber: "RS-1001", refHref: "/restaurant/reservations?date=2026-10-17" });
  });
});
