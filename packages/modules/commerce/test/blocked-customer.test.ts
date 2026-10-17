import { beforeAll, describe, expect, it } from "vitest";
import { customers, eq, orders, products } from "@rentweb/db";
import { CUSTOMER_BLOCKED_MESSAGE } from "@rentweb/core/customer";
import { addCartItem, createOrderFromCart, getOrCreateCart, type CreateOrderInput } from "../src/services";
import { SETTINGS, setupFixture, type Fixture } from "./helpers";

/** ADMIN_B2-13: "บล็อกลูกค้า" must stop new orders, also as a guest with the same phone / e-mail. */
let f: Fixture;
let blockedId = "";
const address = { name: "สมชาย ใจดี", phone: "0891234567", line1: "99/9 ถ.นิมมานเหมินท์", subdistrict: "สุเทพ", district: "เมือง", province: "เชียงใหม่", postalCode: "50200", country: "TH" };

beforeAll(async () => {
  f = await setupFixture();
  const [c] = await f.run((tx) => tx.insert(customers).values({ tenantId: f.tenantId, phone: "0899990004", email: "blocked@example.com", name: "Blocked", blockedAt: new Date() }).returning({ id: customers.id }));
  blockedId = c!.id;
});

async function cart() {
  const slug = `p-${Math.random().toString(36).slice(2, 10)}`;
  return f.run(async (tx) => {
    const [p] = await tx.insert(products).values({ tenantId: f.tenantId, name: slug, slug, price: 10000, stock: 5, weightGrams: 100, status: "active", publishedAt: new Date() }).returning({ id: products.id });
    const { cart } = await getOrCreateCart(tx, f.tenantId, null, null);
    const a = await addCartItem(tx, f.tenantId, cart.id, { productId: p!.id, quantity: 1 });
    if (!a.ok) throw new Error(a.error);
    return { token: cart.token, productId: p!.id };
  });
}

function input(cartToken: string, over: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return { cartToken, customer: null, contact: { name: "ลูกค้า", phone: "089-999-0004", email: null }, address, shippingMethodId: f.ids.shipFlat, paymentMethod: "promptpay_qr", settings: SETTINGS, ...over };
}

describe("blocked customer checkout (ADMIN_B2-13)", () => {
  it("guest checkout with the blocked phone is refused politely and writes nothing", async () => {
    const { token, productId } = await cart();
    const before = await f.run(async (tx) => (await tx.select().from(orders)).length);
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token)));
    expect(r).toMatchObject({ ok: false, code: "customer_blocked", error: CUSTOMER_BLOCKED_MESSAGE });
    expect(await f.run(async (tx) => (await tx.select().from(orders)).length)).toBe(before);
    expect(await f.run(async (tx) => (await tx.select({ s: products.stock }).from(products).where(eq(products.id, productId)))[0]!.s)).toBe(5);
  });

  it("guest with another phone but the blocked e-mail, and the signed-in blocked id, are refused", async () => {
    const a = await cart();
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(a.token, { contact: { name: "x", phone: "0812222222", email: "Blocked@Example.com" } })))).toMatchObject({ ok: false, code: "customer_blocked" });
    const b = await cart();
    expect(await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(b.token, { customer: { id: blockedId, name: "Blocked", phone: "0899990004", email: null }, contact: { name: "x", phone: "0813333333", email: null } })))).toMatchObject({ ok: false, code: "customer_blocked" });
  });

  it("other customers still check out", async () => {
    const { token } = await cart();
    const r = await f.run((tx) => createOrderFromCart(tx, f.tenantId, input(token, { contact: { name: "ok", phone: "0814444444", email: null } })));
    expect(r.ok).toBe(true);
  });
});
