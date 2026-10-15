import { beforeAll, describe, expect, it } from "vitest";
import {
  addCartItem,
  applyCoupon,
  cartItemCount,
  computeTotals,
  evaluateCoupon,
  getOrCreateCart,
  loadCart,
  removeCoupon,
  updateCartItem,
  type CartLine,
  type DiscountRow,
} from "../src/services";
import { setupFixture, type Fixture } from "./helpers";

let f: Fixture;

beforeAll(async () => {
  f = await setupFixture();
});

const line = (over: Partial<CartLine>): CartLine => ({
  id: "l",
  productId: "p",
  variantId: null,
  name: "x",
  slug: "x",
  variantTitle: null,
  sku: null,
  image: null,
  unitPrice: 10000,
  compareAtPrice: null,
  quantity: 1,
  lineTotal: 10000,
  available: null,
  weightGrams: 0,
  type: "physical",
  categoryId: null,
  active: true,
  ...over,
});

const discount = (over: Partial<DiscountRow>): DiscountRow => ({
  id: "d",
  tenantId: "t",
  code: "CODE",
  name: null,
  type: "percent",
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  maxUses: null,
  usedCount: 0,
  perCustomerLimit: null,
  appliesTo: null,
  startsAt: null,
  endsAt: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("cart totals", () => {
  it("creates lazily, merges same product+variant and sums totals", async () => {
    const { token } = await f.run(async (tx) => {
      const { cart, created } = await getOrCreateCart(tx, f.tenantId, null);
      expect(created).toBe(true);
      expect(cart.status).toBe("active");
      expect(cart.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      // same token again → reused, not recreated
      const again = await getOrCreateCart(tx, f.tenantId, cart.token);
      expect(again.created).toBe(false);
      expect(again.cart.id).toBe(cart.id);

      const a = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 2 });
      expect(a.ok).toBe(true);
      const b = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 1 });
      expect(b.ok && b.value.item.quantity).toBe(3);
      const c = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.variant, variantId: f.ids.variantS, quantity: 1 });
      expect(c.ok).toBe(true);
      return { token: cart.token };
    });

    const view = await f.run((tx) => loadCart(tx, f.tenantId, token));
    expect(view).not.toBeNull();
    expect(view!.items).toHaveLength(2);
    expect(view!.itemCount).toBe(4);
    expect(view!.subtotal).toBe(3 * 50000 + 100000);
    expect(view!.total).toBe(view!.subtotal);
    expect(view!.weightGrams).toBe(3 * 500 + 300);
    expect(view!.items[1]!.variantTitle).toBe("S");
    expect(view!.items[1]!.available).toBe(2);
    expect(await f.run((tx) => cartItemCount(tx, f.tenantId, token))).toBe(4);
    expect(await f.run((tx) => cartItemCount(tx, f.tenantId, "nope"))).toBe(0);
  });

  it("caps quantities to stock and rejects sold-out / missing variant", async () => {
    await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      const r = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 10 });
      expect(r.ok && r.value.item.quantity).toBe(5);
      expect(r.ok && r.value.adjusted).toBe(true);
      const again = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.simple, quantity: 1 });
      expect(again.ok).toBe(false);
      expect(!again.ok && again.code).toBe("out_of_stock");

      const noVariant = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.variant });
      expect(!noVariant.ok && noVariant.code).toBe("variant_required");
      const m = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.variant, variantId: f.ids.variantM });
      expect(!m.ok && m.code).toBe("out_of_stock");
      const so = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.soldOut });
      expect(!so.ok && so.code).toBe("out_of_stock");

      // services are unlimited
      const svc = await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.service, quantity: 50 });
      expect(svc.ok && svc.value.item.quantity).toBe(50);

      const upd = await updateCartItem(tx, f.tenantId, cart.id, (r as { ok: true; value: { item: { id: string } } }).value.item.id, 2);
      expect(upd.ok && upd.value.quantity).toBe(2);
      const rm = await updateCartItem(tx, f.tenantId, cart.id, (r as { ok: true; value: { item: { id: string } } }).value.item.id, 0);
      expect(rm.ok && rm.value.quantity).toBe(0);
      const view = await loadCart(tx, f.tenantId, cart.token);
      expect(view!.items.map((l) => l.productId)).toEqual([f.ids.service]);
    });
  });
});

describe("coupon rules (pure)", () => {
  const lines = [line({ productId: "a", categoryId: "c1", lineTotal: 60000, unitPrice: 60000 }), line({ productId: "b", categoryId: "c2", lineTotal: 40000, unitPrice: 40000 })];

  it("percent with max cap", () => {
    const r = evaluateCoupon(discount({ type: "percent", value: 10, maxDiscount: 5000 }), { lines });
    expect(r.ok && r.value.amount).toBe(5000);
    const r2 = evaluateCoupon(discount({ type: "percent", value: 10 }), { lines });
    expect(r2.ok && r2.value.amount).toBe(10000);
  });

  it("fixed never exceeds eligible subtotal", () => {
    const r = evaluateCoupon(discount({ type: "fixed", value: 500000 }), { lines });
    expect(r.ok && r.value.amount).toBe(100000);
  });

  it("free shipping has no item discount", () => {
    const r = evaluateCoupon(discount({ type: "free_shipping", value: 0 }), { lines });
    expect(r.ok && r.value.freeShipping).toBe(true);
    expect(r.ok && r.value.amount).toBe(0);
    expect(computeTotals(lines, r.ok ? r.value : null)).toMatchObject({ subtotal: 100000, discountTotal: 0, total: 100000, freeShipping: true, itemCount: 2 });
  });

  it("minSubtotal, date window, active, maxUses, perCustomerLimit", () => {
    expect(evaluateCoupon(discount({ minSubtotal: 100001 }), { lines })).toMatchObject({ ok: false, code: "min_subtotal" });
    expect(evaluateCoupon(discount({ endsAt: new Date(Date.now() - 1000) }), { lines })).toMatchObject({ ok: false, code: "expired" });
    expect(evaluateCoupon(discount({ startsAt: new Date(Date.now() + 86_400_000) }), { lines })).toMatchObject({ ok: false, code: "not_started" });
    expect(evaluateCoupon(discount({ active: false }), { lines })).toMatchObject({ ok: false, code: "inactive" });
    expect(evaluateCoupon(discount({ maxUses: 3, usedCount: 3 }), { lines })).toMatchObject({ ok: false, code: "max_uses" });
    expect(evaluateCoupon(discount({ perCustomerLimit: 1 }), { lines, customerUses: 1 })).toMatchObject({ ok: false, code: "per_customer" });
    expect(evaluateCoupon(discount({ perCustomerLimit: 1 }), { lines, customerUses: 0 }).ok).toBe(true);
    expect(evaluateCoupon(discount({ perCustomerLimit: 1 }), { lines, customerUses: null }).ok).toBe(true);
  });

  it("appliesTo restricts the eligible subtotal", () => {
    const r = evaluateCoupon(discount({ type: "percent", value: 50, appliesTo: { categoryIds: ["c1"] } }), { lines });
    expect(r.ok && r.value.amount).toBe(30000);
    const none = evaluateCoupon(discount({ appliesTo: { productIds: ["zzz"] } }), { lines });
    expect(none).toMatchObject({ ok: false, code: "not_applicable" });
  });

  it("discount never exceeds subtotal in totals", () => {
    const r = evaluateCoupon(discount({ type: "fixed", value: 100000 }), { lines });
    expect(computeTotals(lines, r.ok ? r.value : null).total).toBe(0);
  });
});

describe("coupons on a real cart", () => {
  it("applies, re-validates on load and removes", async () => {
    await f.run(async (tx) => {
      const { cart } = await getOrCreateCart(tx, f.tenantId, null);
      await addCartItem(tx, f.tenantId, cart.id, { productId: f.ids.service, quantity: 2 }); // ฿600

      const bad = await applyCoupon(tx, f.tenantId, cart.id, "NOPE");
      expect(bad.ok).toBe(false);
      expect((await applyCoupon(tx, f.tenantId, cart.id, "expired")).ok).toBe(false);
      expect((await applyCoupon(tx, f.tenantId, cart.id, "MAXED")).ok).toBe(false);
      expect((await applyCoupon(tx, f.tenantId, cart.id, "OFF")).ok).toBe(false);
      // APPAREL20 applies only to the apparel category – the service is not in it
      expect(await applyCoupon(tx, f.tenantId, cart.id, "APPAREL20")).toMatchObject({ ok: false, code: "not_applicable" });

      const good = await applyCoupon(tx, f.tenantId, cart.id, "welcome10");
      expect(good.ok && good.value.code).toBe("WELCOME10");
      let view = await loadCart(tx, f.tenantId, cart.token);
      expect(view!.coupon?.amount).toBe(6000);
      expect(view!.discountTotal).toBe(6000);
      expect(view!.total).toBe(54000);
      expect(view!.couponError).toBeNull();

      // subtotal drops below the minimum → coupon kept on the cart but reported invalid, no discount
      await updateCartItem(tx, f.tenantId, cart.id, view!.items[0]!.id, 1);
      view = await loadCart(tx, f.tenantId, cart.token);
      expect(view!.coupon).toBeNull();
      expect(view!.couponError).toMatch(/ขั้นต่ำ/);
      expect(view!.discountTotal).toBe(0);

      await removeCoupon(tx, f.tenantId, cart.id);
      view = await loadCart(tx, f.tenantId, cart.token);
      expect(view!.couponCode).toBeNull();

      const ship = await applyCoupon(tx, f.tenantId, cart.id, "FREESHIP");
      expect(ship).toMatchObject({ ok: false, code: "min_subtotal" });
      await updateCartItem(tx, f.tenantId, cart.id, view!.items[0]!.id, 2);
      expect((await applyCoupon(tx, f.tenantId, cart.id, "FREESHIP")).ok).toBe(true);
      view = await loadCart(tx, f.tenantId, cart.token);
      expect(view!.freeShipping).toBe(true);
    });
  });
});
