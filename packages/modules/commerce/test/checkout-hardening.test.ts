/**
 * Bug-hunt regressions (commerce packet): COR-03, COR-04, COR-05, COR-06, COR-23, SS-12 and the payment-layer
 * follow-ups (closed handler for "order", onOrderPaid refundRequired, cancelPayment).
 * PGlite has a single connection, so Promise.all over separate transactions runs them one after another; the
 * tests still pin the "second caller sees the first one's commit" logic. Real parallelism is covered by
 * tooling/qa/bughunt/fixes/COR-04-05-06-verify.ts against Postgres.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { cartItems, carts, customers, discounts, eventsOutbox, inventoryMovements, orders, payments, products } from "@rentweb/db";
import { cancelPayment, createPayment, expirePayment, expireStalePayments, markPaid, paymentRefundRequired, registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import {
  addCartItem,
  applyCoupon,
  cancelUnpaidOrder,
  cartItemCount,
  checkoutPaymentMethods,
  createOrderFromCart,
  findActiveCart,
  getOrCreateCart,
  loadCart,
  onOrderPaid,
  onOrderPaymentClosed,
  type CreateOrderInput,
} from "../src/services";
import { SETTINGS, setupFixture, type Fixture } from "./helpers";

let f: Fixture;

beforeAll(async () => {
  f = await setupFixture();
  registerPaymentHandler("order", onOrderPaid);
  registerPaymentClosedHandler("order", onOrderPaymentClosed);
});

const address = { name: "สมชาย ใจดี", phone: "0891234567", line1: "99/9 ถ.นิมมานเหมินท์", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" };

function input(cartToken: string, over: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    cartToken,
    customer: null,
    contact: { name: "สมชาย ใจดี", phone: "089-123-4567", email: null },
    address,
    shippingMethodId: f.ids.shipFlat,
    paymentMethod: "promptpay_qr",
    settings: SETTINGS,
    ...over,
  };
}

async function newProduct(stock: number, price = 10000) {
  const slug = `p-${Math.random().toString(36).slice(2, 10)}`;
  return f.run(async (tx) => (await tx.insert(products).values({ tenantId: f.tenantId, name: `สินค้า ${slug}`, slug, price, stock, weightGrams: 100, status: "active", publishedAt: new Date() }).returning({ id: products.id }))[0]!.id);
}

async function cartWith(productId: string, qty: number, coupon?: string, customerId?: string | null) {
  return f.run(async (tx) => {
    const { cart } = await getOrCreateCart(tx, f.tenantId, null, customerId ?? null);
    const a = await addCartItem(tx, f.tenantId, cart.id, { productId, quantity: qty });
    if (!a.ok) throw new Error(a.error);
    if (coupon) {
      const c = await applyCoupon(tx, f.tenantId, cart.id, coupon);
      if (!c.ok) throw new Error(c.error);
    }
    return cart.token;
  });
}

const stockOf = (id: string) => f.run(async (tx) => (await tx.select({ s: products.stock }).from(products).where(eq(products.id, id)))[0]!.s);
const discountRow = (code: string) => f.run(async (tx) => (await tx.select().from(discounts).where(and(eq(discounts.tenantId, f.tenantId), eq(discounts.code, code))))[0]!);

describe("COR-04 parallel add-to-cart", () => {
  it("merges into one line capped by stock; duplicate lines are impossible", async () => {
    const pid = await newProduct(2);
    const cartId = await f.run(async (tx) => (await getOrCreateCart(tx, f.tenantId, null)).cart.id);
    const rs = await Promise.all([0, 1, 2].map(() => f.run((tx) => addCartItem(tx, f.tenantId, cartId, { productId: pid, quantity: 2 }))));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const lines = await f.run((tx) => tx.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, pid))));
    expect(lines.map((l) => l.quantity)).toEqual([2]);
    // the unique (cart_id, product_id, variant_id) constraint stops a second line even if code raced
    await expect(f.run((tx) => tx.insert(cartItems).values({ tenantId: f.tenantId, cartId, productId: pid, variantId: null, quantity: 1 }))).rejects.toThrow();
  });
});

describe("COR-05 double submit", () => {
  it("one cart → exactly one order, stock decremented once", async () => {
    const pid = await newProduct(19);
    const token = await cartWith(pid, 2);
    const before = await f.run(async (tx) => (await tx.select({ n: sql<number>`count(*)::int` }).from(orders))[0]!.n);
    const [a, b] = await Promise.all([f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token))), f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token)))]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((a.ok ? b : a)).toMatchObject({ ok: false, code: "empty" });
    expect(await stockOf(pid)).toBe(17);
    const after = await f.run(async (tx) => (await tx.select({ n: sql<number>`count(*)::int` }).from(orders))[0]!.n);
    expect(after - before).toBe(1);
  });
});

describe("COR-06 coupon maxUses under parallel checkouts", () => {
  it("only one order gets a maxUses=1 coupon; the other is told and can re-submit at full price", async () => {
    await f.run((tx) => tx.insert(discounts).values({ tenantId: f.tenantId, code: "ONCE", type: "percent", value: 10, maxUses: 1 }));
    const [p1, p2] = [await newProduct(5), await newProduct(5)];
    const [t1, t2] = [await cartWith(p1, 1, "ONCE"), await cartWith(p2, 1, "ONCE")];
    const rs = await Promise.all([
      f.run((tx) => createOrderFromCart(tx, f.tenantId, input(t1, { contact: { name: "A", phone: "0811111111" } }))),
      f.run((tx) => createOrderFromCart(tx, f.tenantId, input(t2, { contact: { name: "B", phone: "0822222222" } }))),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const loser = rs.find((r) => !r.ok)!;
    expect(loser).toMatchObject({ ok: false, code: "coupon" });
    expect(!loser.ok && loser.error).toMatch(/ONCE/);
    expect((await discountRow("ONCE")).usedCount).toBe(1);
    const withCode = await f.run((tx) => tx.select().from(orders).where(eq(orders.couponCode, "ONCE")));
    expect(withCode).toHaveLength(1);
    // the coupon was dropped from the losing cart: a second submit goes through at full price
    const loserToken = rs[0]!.ok ? t2 : t1;
    const retry = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(loserToken, { contact: { name: "B", phone: "0822222222" } })));
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.value.total).toBe(10000 + 6000);
  });
});

describe("COR-03 per-customer limit for guests", () => {
  it("the same phone (any format) or e-mail cannot reuse a once-per-customer code", async () => {
    await f.run((tx) => tx.insert(discounts).values({ tenantId: f.tenantId, code: "ONEEACH", type: "fixed", value: 1000, perCustomerLimit: 1 }));
    const pid = await newProduct(10);
    const first = await (async () => { const tok = await cartWith(pid, 1, "ONEEACH"); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok, { contact: { name: "ก", phone: "0899000001", email: "Guest@Example.com" } }))); })();
    expect(first.ok).toBe(true);
    const samePhone = await (async () => { const tok = await cartWith(pid, 1, "ONEEACH"); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok, { contact: { name: "ก", phone: "089-900-0001" } }))); })();
    expect(samePhone).toMatchObject({ ok: false, code: "coupon" });
    expect(!samePhone.ok && samePhone.error).toMatch(/ครบจำนวน/);
    const sameEmail = await (async () => { const tok = await cartWith(pid, 1, "ONEEACH"); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok, { contact: { name: "ก", phone: "0899000002", email: "guest@example.com" } }))); })();
    expect(sameEmail).toMatchObject({ ok: false, code: "coupon" });
    const other = await (async () => { const tok = await cartWith(pid, 1, "ONEEACH"); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok, { contact: { name: "ข", phone: "0899000003" } }))); })();
    expect(other.ok).toBe(true);
    // a cancelled order gives the use back
    if (!first.ok) return;
    await f.run(async (tx) => expect((await cancelUnpaidOrder(tx, f.tenantId, first.value.orderId, { accessKey: first.value.accessKey })).ok).toBe(true));
    const again = await (async () => { const tok = await cartWith(pid, 1, "ONEEACH"); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok, { contact: { name: "ก", phone: "0899000001" } }))); })();
    expect(again.ok).toBe(true);
  });
});

describe("COR-23 payment methods", () => {
  const noReceiver = { payments: { enabled: { promptpay: true, bankTransfer: true } } };
  it("checkoutPaymentMethods needs a receiver and never offers card / wallet", () => {
    expect(checkoutPaymentMethods(SETTINGS)).toEqual(["promptpay_qr", "slip", "cod"]);
    expect(checkoutPaymentMethods(noReceiver)).toEqual([]);
    expect(checkoutPaymentMethods({ payments: { promptpayId: "0812345678", enabled: { card: true, wallet: true, cash: true } } })).toEqual(["promptpay_qr", "cash"]);
    expect(checkoutPaymentMethods({ payments: { bankAccounts: [{ bank: "กสิกรไทย", name: "ร้าน", number: "123" }], enabled: { promptpay: false } } })).toEqual(["slip"]);
  });
  it("createOrderFromCart rejects disabled methods, no-receiver shops and cash for delivery", async () => {
    const pid = await newProduct(10);
    const token = await cartWith(pid, 1);
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { paymentMethod: "card" })))).toMatchObject({ ok: false, code: "payment_method" });
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { paymentMethod: "cash" })))).toMatchObject({ ok: false, code: "payment_method" });
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { settings: noReceiver })));
    expect(r).toMatchObject({ ok: false, code: "payment_unavailable" });
    expect(!r.ok && r.error).toMatch(/ยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน/);
    const cashShop = { payments: { ...SETTINGS.payments, enabled: { ...SETTINGS.payments.enabled, cash: true } } };
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { paymentMethod: "cash", settings: cashShop })))).toMatchObject({ ok: false, code: "cash_pickup_only" });
    const pickup = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { paymentMethod: "cash", settings: cashShop, shippingMethodId: f.ids.shipPickup, address: null })));
    expect(pickup.ok).toBe(true);
  });
});

describe("payments-api follow-ups: closed handler, refundRequired, cancelPayment", () => {
  it("an expired QR cancels the pending order, restocks and releases the coupon (once)", async () => {
    const pid = await newProduct(5);
    const token = await cartWith(pid, 2, "FIXED50");
    const used = (await discountRow("FIXED50")).usedCount;
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await stockOf(pid)).toBe(3);
    expect((await discountRow("FIXED50")).usedCount).toBe(used + 1);
    const res = await expireStalePayments(f.db, { now: new Date(Date.now() + 3 * 3600_000), refTypes: ["order"] });
    expect(res.expired).toBeGreaterThanOrEqual(1);
    await f.run(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect(o).toMatchObject({ status: "cancelled", cancelReason: "หมดเวลาชำระเงิน" });
      const [pay] = await tx.select().from(payments).where(eq(payments.id, r.value.paymentId));
      expect(pay!.status).toBe("expired");
      const moves = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.refId, r.value.orderId), eq(inventoryMovements.reason, "release")));
      expect(moves.map((m) => m.delta)).toEqual([2]);
      const ev = await tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.type, "order.cancelled"), sql`${eventsOutbox.payload}->>'orderId' = ${r.value.orderId}`));
      expect(ev[0]?.payload).toMatchObject({ by: "system", reason: "หมดเวลาชำระเงิน" });
      // handler again (idempotent): nothing changes
      await onOrderPaymentClosed(tx, pay!, { status: "expired", reason: "x" });
    });
    expect(await stockOf(pid)).toBe(5);
    expect((await discountRow("FIXED50")).usedCount).toBe(used);
    // late money for the cancelled order → paid but flagged for a refund, order stays cancelled
    await f.run(async (tx) => {
      const paid = await markPaid(tx, f.tenantId, r.value.paymentId, { verifiedBy: "admin" });
      expect(paymentRefundRequired(paid)).toBeTruthy();
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect(o).toMatchObject({ status: "cancelled", paymentStatus: "unpaid" });
    });
    expect(await stockOf(pid)).toBe(5);
  });

  it("a superseded payment does not cancel the order; a second payment of a paid order is a duplicate", async () => {
    const pid = await newProduct(5);
    const r = await (async () => { const tok = await cartWith(pid, 1); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok))); })();
    if (!r.ok) throw new Error(r.error);
    const extra = await f.run((tx) => createPayment(tx, f.tenantId, { refType: "order", refId: r.value.orderId, amount: r.value.total, provider: "bank_transfer", method: "slip" }));
    // voiding the non-current payment leaves the order alone
    await f.run((tx) => cancelPayment(tx, f.tenantId, extra.id, "test"));
    await f.run(async (tx) => expect((await tx.select().from(orders).where(eq(orders.id, r.value.orderId)))[0]!.status).toBe("pending"));
    // pay the order, then money arrives on another payment → refund flag, stats counted once
    await f.run((tx) => markPaid(tx, f.tenantId, r.value.paymentId, { verifiedBy: "admin" }));
    const dup = await f.run((tx) => createPayment(tx, f.tenantId, { refType: "order", refId: r.value.orderId, amount: r.value.total, provider: "bank_transfer", method: "slip" }));
    const flagged = await f.run((tx) => markPaid(tx, f.tenantId, dup.id, { verifiedBy: "admin" }));
    expect(paymentRefundRequired(flagged)).toMatch(/ชำระซ้ำ/);
    await f.run(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect(o).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
      const [c] = await tx.select().from(customers).where(eq(customers.id, o!.customerId!));
      const [p] = await tx.select().from(products).where(eq(products.id, pid));
      expect(p!.soldCount).toBe(1);
      expect(c!.ordersCount).toBeGreaterThanOrEqual(1);
    });
  });

  it("paying one payment voids the order's other open payments; customer cancel uses cancelPayment and respects a pending slip", async () => {
    const pid = await newProduct(5);
    const r = await (async () => { const tok = await cartWith(pid, 1); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok))); })();
    if (!r.ok) throw new Error(r.error);
    const second = await f.run((tx) => createPayment(tx, f.tenantId, { refType: "order", refId: r.value.orderId, amount: r.value.total, provider: "bank_transfer", method: "slip" }));
    await f.run((tx) => markPaid(tx, f.tenantId, second.id, { verifiedBy: "admin" }));
    await f.run(async (tx) => {
      const [first] = await tx.select().from(payments).where(eq(payments.id, r.value.paymentId));
      expect(first!.status).toBe("cancelled");
      const [o] = await tx.select().from(orders).where(eq(orders.id, r.value.orderId));
      expect((o!.metadata as { paymentId: string }).paymentId).toBe(second.id);
    });

    const r2 = await (async () => { const tok = await cartWith(pid, 1); return f.run((tx) => createOrderFromCart(tx, f.tenantId, input(tok))); })();
    if (!r2.ok) throw new Error(r2.error);
    await f.run((tx) => tx.update(payments).set({ status: "pending_verification", slipUrl: "/uploads/x.png" }).where(eq(payments.id, r2.value.paymentId)));
    expect(await f.run((tx) => cancelUnpaidOrder(tx, f.tenantId, r2.value.orderId, { accessKey: r2.value.accessKey }))).toMatchObject({ ok: false, code: "slip_pending" });
    await f.run((tx) => tx.update(payments).set({ status: "pending", slipUrl: null }).where(eq(payments.id, r2.value.paymentId)));
    expect((await f.run((tx) => cancelUnpaidOrder(tx, f.tenantId, r2.value.orderId, { accessKey: r2.value.accessKey }))).ok).toBe(true);
    await f.run(async (tx) => {
      const ev = await tx.select().from(eventsOutbox).where(and(eq(eventsOutbox.type, "payment.cancelled"), sql`${eventsOutbox.payload}->>'paymentId' = ${r2.value.paymentId}`));
      expect(ev).toHaveLength(1);
      const [o] = await tx.select().from(orders).where(eq(orders.id, r2.value.orderId));
      expect(o!.status).toBe("cancelled"); // runHandler: false — the module cancelled the order itself, exactly once
    });
    // expirePayment on an already cancelled payment is a no-op
    expect(await f.run((tx) => expirePayment(tx, f.tenantId, r2.value.paymentId, { now: new Date(Date.now() + 86_400_000) }))).toBeNull();
  });
});

describe("SS-12 cart follows the signed-in customer across devices", () => {
  it("merges the account cart from device A into the guest cart that logs in on device B", async () => {
    const [p1, p2] = [await newProduct(10), await newProduct(1)];
    const customerId = await f.run(async (tx) => (await tx.insert(customers).values({ tenantId: f.tenantId, phone: "0861234567", name: "ลูกค้า" }).returning({ id: customers.id }))[0]!.id);
    const tokenA = await cartWith(p1, 2, undefined, customerId); // device A, signed in
    await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, tokenA, customerId);
      await addCartItem(tx, f.tenantId, cart.id, { productId: p2, quantity: 1 });
    });
    const tokenB = await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null); // device B, guest
      await addCartItem(tx, f.tenantId, cart.id, { productId: p1, quantity: 1 });
      await addCartItem(tx, f.tenantId, cart.id, { productId: p2, quantity: 1 });
      return cart.token;
    });
    // B logs in: its next cart read merges A's cart into B's
    const view = await f.run((tx) => loadCart(tx, f.tenantId, tokenB, { customerId }));
    expect(view!.token).toBe(tokenB);
    const q = Object.fromEntries(view!.items.map((l) => [l.productId, l.quantity]));
    expect(q).toEqual({ [p1]: 3, [p2]: 1 }); // p2 capped by its stock of 1
    await f.run(async (tx) => {
      const [a] = await tx.select().from(carts).where(eq(carts.token, tokenA));
      expect(a).toMatchObject({ status: "merged", mergedIntoId: view!.id });
      const [b] = await tx.select().from(carts).where(eq(carts.token, tokenB));
      expect(b!.customerId).toBe(customerId);
      // device A (old cookie) resolves to the same cart, even for the header count without a session
      expect((await findActiveCart(tx, f.tenantId, tokenA))!.id).toBe(view!.id);
      expect(await cartItemCount(tx, f.tenantId, tokenA)).toBe(4);
      // and a cart write from A tells the route to re-set the cookie
      const again = await getOrCreateCart(tx, f.tenantId, tokenA, customerId);
      expect(again).toMatchObject({ created: true, cart: { token: tokenB } });
    });
  });

  it("another customer's cookie cart is not used for the signed-in customer", async () => {
    const pid = await newProduct(10);
    const [x, y] = await f.run(async (tx) =>
      (await tx.insert(customers).values([{ tenantId: f.tenantId, phone: "0871111111" }, { tenantId: f.tenantId, phone: "0872222222" }]).returning({ id: customers.id })).map((r) => r.id),
    );
    const tokenY = await cartWith(pid, 1, undefined, y);
    const got = await f.run((tx) => getOrCreateCart(tx, f.tenantId, tokenY, x));
    expect(got.created).toBe(true);
    expect(got.cart.token).not.toBe(tokenY);
    await f.run(async (tx) => expect((await tx.select().from(carts).where(eq(carts.token, tokenY)))[0]).toMatchObject({ status: "active", customerId: y }));
  });
});
