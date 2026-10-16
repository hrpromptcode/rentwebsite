import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { carts, customers, discounts, inventoryMovements, orders, payments, productVariants, products } from "@rentweb/db";
import { markPaid, registerPaymentHandler } from "@rentweb/core/payments";
import {
  addCartItem,
  applyCoupon,
  cancelUnpaidOrder,
  createOrderFromCart,
  createReview,
  findOrderByNumberAndContact,
  getOrCreateCart,
  getOrderForCustomer,
  listCustomerOrders,
  onOrderPaid,
  type CreateOrderInput,
} from "../src/services";
import { SETTINGS, setupFixture, type Fixture } from "./helpers";

let f: Fixture;

beforeAll(async () => {
  f = await setupFixture();
  registerPaymentHandler("order", onOrderPaid);
});

const address = { name: "สมชาย ใจดี", phone: "0891234567", line1: "99/9 ถ.นิมมานเหมินท์", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" };

function orderInput(cartToken: string, over: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    cartToken,
    customer: null,
    contact: { name: "สมชาย ใจดี", phone: "089-123-4567", email: "Somchai@Example.com" },
    address,
    shippingMethodId: f.ids.shipFlat,
    paymentMethod: "promptpay_qr",
    note: "ฝากไว้ที่ป้อมยาม",
    settings: SETTINGS,
    ...over,
  };
}

describe("createOrderFromCart", () => {
  let firstOrderId: string;
  let firstPaymentId: string;
  let firstKey: string;

  it("snapshots items, decrements stock, numbers from #1001 and opens a payment", async () => {
    const token = await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 2 });
      await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.variant, variantId: f.ids.variantS, quantity: 1 });
      const c = await applyCoupon(tx, f.tenantId, cart.id, "WELCOME10");
      expect(c.ok).toBe(true);
      return cart.token;
    });

    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.number).toBe("#1001");
    expect(r.value.total).toBe(200000 - 20000 + 6000);
    firstOrderId = r.value.orderId;
    firstPaymentId = r.value.paymentId;
    firstKey = r.value.accessKey;

    await f.run(async (tx) => {
      const [p] = await tx.select().from(products).where(eq(products.id, f.ids.simple));
      expect(p!.stock).toBe(3);
      const [v] = await tx.select().from(productVariants).where(eq(productVariants.id, f.ids.variantS));
      expect(v!.stock).toBe(1);
      const moves = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.refType, "order"), eq(inventoryMovements.refId, r.value.orderId)));
      expect(moves.map((m) => [m.reason, m.delta]).sort()).toEqual([["sale", -2], ["sale", -1]].sort());
      const [d] = await tx.select().from(discounts).where(eq(discounts.code, "WELCOME10"));
      expect(d!.usedCount).toBe(1);
      const [cart] = await tx.select().from(carts).where(eq(carts.token, token));
      expect(cart!.status).toBe("converted");
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect(o).toMatchObject({ status: "pending", paymentStatus: "unpaid", subtotal: 200000, discountTotal: 20000, shippingTotal: 6000, total: 186000, couponCode: "WELCOME10", phone: "0891234567", email: "somchai@example.com", shippingMethodType: "flat", customerNote: "ฝากไว้ที่ป้อมยาม" });
      expect((o!.metadata as { accessKey: string; paymentId: string }).accessKey).toBe(r.value.accessKey);
      expect((o!.metadata as { paymentId: string }).paymentId).toBe(r.value.paymentId);
      expect(o!.customerId).toBeTruthy();
      const [pay] = await tx.select().from(payments).where(eq(payments.id, r.value.paymentId));
      expect(pay).toMatchObject({ refType: "order", refId: r.value.orderId, status: "pending", amount: 186000, provider: "promptpay", method: "promptpay_qr" });
      expect(pay!.qrPayload).toBeTruthy();
      expect(pay!.expiresAt).toBeTruthy();
    });

    // the cart token is converted: a second order from it is rejected
    const again = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token)));
    expect(again).toMatchObject({ ok: false, code: "empty" });
  });

  it("rejects sold-out lines without writing anything (stock changed after adding to cart)", async () => {
    const token = await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      const a = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 3 });
      expect(a.ok).toBe(true);
      // someone else buys the last pieces in the meantime
      await tx.update(products).set({ stock: 1 }).where(eq(products.id, f.ids.simple));
      return cart.token;
    });
    const before = await f.run((tx) => tx.select({ id: orders.id }).from(orders));
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token)));
    expect(r).toMatchObject({ ok: false, code: "out_of_stock" });
    expect(!r.ok && r.error).toMatch(/เหลือเพียง 1 ชิ้น/);
    const after = await f.run((tx) => tx.select({ id: orders.id }).from(orders));
    expect(after.length).toBe(before.length);
    await f.run(async (tx) => {
      const [cart] = await tx.select().from(carts).where(eq(carts.token, token));
      expect(cart!.status).toBe("active");
      await tx.update(products).set({ stock: 0 }).where(eq(products.id, f.ids.simple));
    });
    const r2 = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token)));
    expect(r2).toMatchObject({ ok: false, code: "out_of_stock" });
    expect(!r2.ok && r2.error).toMatch(/สินค้าหมด/);
    await f.run((tx) => tx.update(products).set({ stock: 3 }).where(eq(products.id, f.ids.simple)));
  });

  it("enforces COD ⇄ COD-shipping pairing and address for non-pickup", async () => {
    const token = await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.service, quantity: 1 });
      return cart.token;
    });
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token, { shippingMethodId: f.ids.shipCod, paymentMethod: "slip" })))).toMatchObject({ ok: false, code: "cod_required" });
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token, { shippingMethodId: f.ids.shipFlat, paymentMethod: "cod" })))).toMatchObject({ ok: false, code: "cod_not_allowed" });
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token, { address: null })))).toMatchObject({ ok: false, code: "address" });

    const cod = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token, { shippingMethodId: f.ids.shipCod, paymentMethod: "cod" })));
    expect(cod.ok).toBe(true);
    if (!cod.ok) return;
    expect(cod.value.number).toBe("#1002");
    expect(cod.value.total).toBe(30000 + 6000 + 3000);
    await f.run(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, cod.value.orderId));
      expect(o!.status).toBe("confirmed"); // COD is confirmed immediately, payment collected on delivery
      expect(o!.paymentStatus).toBe("unpaid");
      const [pay] = await tx.select().from(payments).where(eq(payments.id, cod.value.paymentId));
      expect(pay).toMatchObject({ provider: "cod", method: "cod", expiresAt: null });
    });
  });

  it("onOrderPaid (via markPaid) marks the order paid once, bumps soldCount and customer stats", async () => {
    await f.run(async (tx) => {
      await markPaid(tx, f.tenantId, firstPaymentId, { verifiedBy: "test" });
      const [o] = await tx.select().from(orders).where(eq(orders.id, firstOrderId));
      expect(o!.paymentStatus).toBe("paid");
      expect(o!.status).toBe("confirmed");
      expect(o!.paidAt).toBeTruthy();
      const [p] = await tx.select().from(products).where(eq(products.id, f.ids.simple));
      expect(p!.soldCount).toBe(2);
      const [v] = await tx.select().from(products).where(eq(products.id, f.ids.variant));
      expect(v!.soldCount).toBe(1);
      const [c] = await tx.select().from(customers).where(eq(customers.id, o!.customerId!));
      // SS-02: a guest record is keyed by the phone only; the e-mail stays on the order
      expect(c).toMatchObject({ ordersCount: 1, totalSpent: 186000, phone: "0891234567", email: null });
      expect(o!.email).toBe("somchai@example.com");

      // idempotent: handler again + markPaid again change nothing
      const [pay] = await tx.select().from(payments).where(eq(payments.id, firstPaymentId));
      await onOrderPaid(tx, pay!);
      await markPaid(tx, f.tenantId, firstPaymentId);
      const [p2] = await tx.select().from(products).where(eq(products.id, f.ids.simple));
      expect(p2!.soldCount).toBe(2);
      const [c2] = await tx.select().from(customers).where(eq(customers.id, o!.customerId!));
      expect(c2!.ordersCount).toBe(1);
    });
  });

  it("getOrderForCustomer honours owner or access key; tracking finds by number + contact", async () => {
    await f.run(async (tx) => {
      expect(await getOrderForCustomer(tx, f.tenantId, firstOrderId, { accessKey: "wrong" })).toBeNull();
      expect(await getOrderForCustomer(tx, f.tenantId, firstOrderId, {})).toBeNull();
      const byKey = await getOrderForCustomer(tx, f.tenantId, firstOrderId, { accessKey: firstKey });
      expect(byKey!.items).toHaveLength(2);
      expect(byKey!.payment!.id).toBe(firstPaymentId);
      const owner = byKey!.order.customerId!;
      const byOwner = await getOrderForCustomer(tx, f.tenantId, firstOrderId, { customerId: owner });
      expect(byOwner!.order.number).toBe("#1001");
      expect(await getOrderForCustomer(tx, f.tenantId, firstOrderId, { customerId: "00000000-0000-7000-8000-000000000000" })).toBeNull();

      expect(await findOrderByNumberAndContact(tx, f.tenantId, "1001", "089 123 4567")).toMatchObject({ id: firstOrderId, accessKey: firstKey });
      expect(await findOrderByNumberAndContact(tx, f.tenantId, "#1001", "SOMCHAI@example.com")).toMatchObject({ id: firstOrderId });
      expect(await findOrderByNumberAndContact(tx, f.tenantId, "#1001", "0800000000")).toBeNull();

      const list = await listCustomerOrders(tx, f.tenantId, owner);
      expect(list.map((o) => o.number)).toEqual(["#1002", "#1001"]);
      expect(list[1]!.itemCount).toBe(3);
    });
  });

  it("cancelUnpaidOrder restocks, voids the payment and releases the coupon; paid orders cannot be cancelled", async () => {
    const paid = await f.run((tx) => cancelUnpaidOrder(tx, f.tenantId, firstOrderId, { accessKey: firstKey }));
    expect(paid).toMatchObject({ ok: false, code: "paid" });

    const token = await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 2 });
      await applyCoupon(tx, f.tenantId, cart.id, "FIXED50");
      return cart.token;
    });
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, orderInput(token, { paymentMethod: "slip" })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await f.run(async (tx) => {
      const [p] = await tx.select().from(products).where(eq(products.id, f.ids.simple));
      expect(p!.stock).toBe(1);
      expect(await cancelUnpaidOrder(tx, f.tenantId, r.value.orderId, { accessKey: "nope" })).toMatchObject({ ok: false, code: "not_found" });
      const c = await cancelUnpaidOrder(tx, f.tenantId, r.value.orderId, { accessKey: r.value.accessKey });
      expect(c.ok).toBe(true);
      const [p2] = await tx.select().from(products).where(eq(products.id, f.ids.simple));
      expect(p2!.stock).toBe(3);
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect(o!.status).toBe("cancelled");
      expect(o!.cancelledAt).toBeTruthy();
      const [pay] = await tx.select().from(payments).where(eq(payments.id, r.value.paymentId));
      expect(pay!.status).toBe("cancelled");
      const [d] = await tx.select().from(discounts).where(eq(discounts.code, "FIXED50"));
      expect(d!.usedCount).toBe(0);
      const moves = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.refId, r.value.orderId), eq(inventoryMovements.reason, "release")));
      expect(moves).toHaveLength(1);
      expect(moves[0]!.delta).toBe(2);
      expect(await cancelUnpaidOrder(tx, f.tenantId, r.value.orderId, { accessKey: r.value.accessKey })).toMatchObject({ ok: false, code: "already_cancelled" });
    });
  });

  it("createReview stores a pending review", async () => {
    await f.run(async (tx) => {
      const bad = await createReview(tx, f.tenantId, { productId: f.ids.simple, authorName: "x", rating: 7 });
      expect(bad.ok).toBe(false);
      const r = await createReview(tx, f.tenantId, { productId: f.ids.simple, authorName: "คุณพลอย", rating: 5, body: "ดีมาก" });
      expect(r.ok && r.value.status).toBe("pending");
    });
  });
});
