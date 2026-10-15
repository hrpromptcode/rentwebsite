import { and, asc, count, eq, gt, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { cartItems, carts, discounts, orders, productVariants, products, type Tx } from "@rentweb/db";
import { fail, ok, randomToken, thb, type Result } from "@rentweb/core";
import { availableStock, variantAvailable, type ProductRow, type VariantRow } from "./products";

export const CART_COOKIE = "rw_cart";
export const CART_TTL_DAYS = 30;

export type CartRow = typeof carts.$inferSelect;
export type CartItemRow = typeof cartItems.$inferSelect;
export type DiscountRow = typeof discounts.$inferSelect;

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  variantTitle: string | null;
  sku: string | null;
  image: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  /** null = unlimited */
  available: number | null;
  weightGrams: number;
  type: string;
  categoryId: string | null;
  /** product is still active & variant still exists */
  active: boolean;
}

export interface CouponEval {
  code: string;
  name: string | null;
  type: "percent" | "fixed" | "free_shipping";
  /** discount on items in satang (0 for free_shipping) */
  amount: number;
  freeShipping: boolean;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  /** subtotal - discountTotal (before shipping) */
  total: number;
  itemCount: number;
  weightGrams: number;
  freeShipping: boolean;
}

export interface CartView extends CartTotals {
  id: string;
  token: string;
  couponCode: string | null;
  coupon: CouponEval | null;
  couponError: string | null;
  items: CartLine[];
}

/* ------------------------------------------------------------------ */
/* Pure helpers (unit tested)                                          */
/* ------------------------------------------------------------------ */

export function eligibleSubtotal(lines: Array<Pick<CartLine, "productId" | "categoryId" | "lineTotal" | "active">>, appliesTo: DiscountRow["appliesTo"]): number {
  const pids = appliesTo?.productIds ?? [];
  const cids = appliesTo?.categoryIds ?? [];
  const restricted = pids.length > 0 || cids.length > 0;
  return lines
    .filter((l) => l.active)
    .filter((l) => !restricted || pids.includes(l.productId) || (l.categoryId ? cids.includes(l.categoryId) : false))
    .reduce((s, l) => s + l.lineTotal, 0);
}

/** Applies every coupon rule. `customerUses` = how many non-cancelled orders this customer already placed with the code. */
export function evaluateCoupon(
  d: DiscountRow,
  ctx: { lines: Array<Pick<CartLine, "productId" | "categoryId" | "lineTotal" | "active">>; now?: Date; customerUses?: number | null },
): Result<CouponEval> {
  const now = ctx.now ?? new Date();
  if (!d.active) return fail("โค้ดนี้ปิดใช้งานแล้ว", "inactive");
  if (d.startsAt && d.startsAt > now) return fail("โค้ดนี้ยังไม่เริ่มใช้งาน", "not_started");
  if (d.endsAt && d.endsAt < now) return fail("โค้ดหมดอายุแล้ว", "expired");
  if (d.maxUses != null && d.usedCount >= d.maxUses) return fail("โค้ดถูกใช้ครบจำนวนแล้ว", "max_uses");
  if (d.perCustomerLimit != null && ctx.customerUses != null && ctx.customerUses >= d.perCustomerLimit) return fail("คุณใช้โค้ดนี้ครบจำนวนแล้ว", "per_customer");
  const subtotal = ctx.lines.filter((l) => l.active).reduce((s, l) => s + l.lineTotal, 0);
  const eligible = eligibleSubtotal(ctx.lines, d.appliesTo);
  if (eligible <= 0) return fail("โค้ดนี้ใช้ไม่ได้กับสินค้าในตะกร้า", "not_applicable");
  if (subtotal < d.minSubtotal) return fail(`ยอดสั่งซื้อขั้นต่ำ ${thb(d.minSubtotal)}`, "min_subtotal");

  const type = d.type as CouponEval["type"];
  let amount = 0;
  if (type === "percent") {
    amount = Math.round((eligible * Math.min(100, Math.max(0, d.value))) / 100);
    if (d.maxDiscount != null && d.maxDiscount > 0) amount = Math.min(amount, d.maxDiscount);
  } else if (type === "fixed") {
    amount = Math.min(Math.max(0, d.value), eligible);
  } else if (type !== "free_shipping") {
    return fail("ประเภทโค้ดไม่รองรับ", "unknown_type");
  }
  return ok({ code: d.code, name: d.name, type, amount, freeShipping: type === "free_shipping" });
}

export function computeTotals(lines: CartLine[], coupon: CouponEval | null): CartTotals {
  const active = lines.filter((l) => l.active);
  const subtotal = active.reduce((s, l) => s + l.lineTotal, 0);
  const discountTotal = Math.min(subtotal, coupon?.amount ?? 0);
  return {
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    itemCount: active.reduce((s, l) => s + l.quantity, 0),
    weightGrams: active.reduce((s, l) => s + l.weightGrams * l.quantity, 0),
    freeShipping: !!coupon?.freeShipping,
  };
}

/* ------------------------------------------------------------------ */
/* Cart rows                                                           */
/* ------------------------------------------------------------------ */

function expiry() {
  return new Date(Date.now() + CART_TTL_DAYS * 86_400_000);
}

/** Active, unexpired cart for a cookie token (null when missing). */
export async function findActiveCart(tx: Tx, tenantId: string, token: string | null | undefined): Promise<CartRow | null> {
  if (!token) return null;
  const [row] = await tx
    .select()
    .from(carts)
    .where(and(eq(carts.tenantId, tenantId), eq(carts.token, token), eq(carts.status, "active"), or(isNull(carts.expiresAt), gt(carts.expiresAt, new Date()))))
    .limit(1);
  return row ?? null;
}

/** Lazily creates the cart; `created` tells the caller to (re)set the cookie. */
export async function getOrCreateCart(tx: Tx, tenantId: string, token: string | null | undefined, customerId?: string | null): Promise<{ cart: CartRow; created: boolean }> {
  const existing = await findActiveCart(tx, tenantId, token);
  if (existing) {
    if (customerId && existing.customerId !== customerId) {
      const [upd] = await tx.update(carts).set({ customerId, expiresAt: expiry() }).where(eq(carts.id, existing.id)).returning();
      return { cart: upd ?? existing, created: false };
    }
    return { cart: existing, created: false };
  }
  const [cart] = await tx
    .insert(carts)
    .values({ tenantId, token: randomToken(24), status: "active", customerId: customerId ?? null, expiresAt: expiry() })
    .returning();
  return { cart: cart!, created: true };
}

async function touch(tx: Tx, cartId: string) {
  await tx.update(carts).set({ expiresAt: expiry() }).where(eq(carts.id, cartId));
}

async function loadProductAndVariant(tx: Tx, tenantId: string, productId: string, variantId: string | null) {
  const [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId))).limit(1);
  if (!product) return null;
  let variant: VariantRow | null = null;
  if (variantId) {
    const [v] = await tx
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, variantId), eq(productVariants.productId, productId)))
      .limit(1);
    variant = v ?? null;
  }
  return { product, variant };
}

function lineAvailability(product: ProductRow, variant: VariantRow | null, allVariants?: VariantRow[]): number | null {
  if (product.hasVariants) return variant ? variantAvailable(product, variant) : 0;
  return availableStock(product, allVariants);
}

/** Add (or merge into) a line. Quantity is capped by the available stock. */
export async function addCartItem(
  tx: Tx,
  tenantId: string,
  cartId: string,
  input: { productId: string; variantId?: string | null; quantity?: number },
): Promise<Result<{ item: CartItemRow; adjusted: boolean }>> {
  const qty = Math.max(1, Math.min(99, Math.floor(input.quantity ?? 1)));
  const loaded = await loadProductAndVariant(tx, tenantId, input.productId, input.variantId ?? null);
  if (!loaded || loaded.product.status !== "active") return fail("ไม่พบสินค้า", "not_found");
  const { product, variant } = loaded;
  if (product.hasVariants && !variant) return fail("กรุณาเลือกตัวเลือกสินค้า", "variant_required");
  if (variant && !variant.active) return fail("ตัวเลือกนี้ไม่พร้อมจำหน่าย", "variant_inactive");

  const [existing] = await tx
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.productId, product.id), variant ? eq(cartItems.variantId, variant.id) : isNull(cartItems.variantId)))
    .limit(1);

  const available = lineAvailability(product, variant);
  const wanted = (existing?.quantity ?? 0) + qty;
  if (available !== null && available <= 0) return fail("สินค้าหมด", "out_of_stock");
  const finalQty = available === null ? wanted : Math.min(wanted, available);
  const adjusted = finalQty < wanted;
  if (existing && finalQty === existing.quantity) return fail(`มีสินค้าในตะกร้าครบตามสต็อกแล้ว (${available} ชิ้น)`, "out_of_stock");

  let item: CartItemRow;
  if (existing) {
    [item] = (await tx.update(cartItems).set({ quantity: finalQty }).where(eq(cartItems.id, existing.id)).returning()) as [CartItemRow];
  } else {
    [item] = (await tx
      .insert(cartItems)
      .values({ tenantId, cartId, productId: product.id, variantId: variant?.id ?? null, quantity: finalQty })
      .returning()) as [CartItemRow];
  }
  await touch(tx, cartId);
  return ok({ item, adjusted });
}

/** Set a line quantity (0 removes). Caps to stock. */
export async function updateCartItem(tx: Tx, tenantId: string, cartId: string, itemId: string, quantity: number): Promise<Result<{ quantity: number; adjusted: boolean }>> {
  const [existing] = await tx.select().from(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.id, itemId))).limit(1);
  if (!existing) return fail("ไม่พบรายการในตะกร้า", "not_found");
  const q = Math.floor(quantity);
  if (q <= 0) {
    await tx.delete(cartItems).where(eq(cartItems.id, existing.id));
    await touch(tx, cartId);
    return ok({ quantity: 0, adjusted: false });
  }
  const loaded = await loadProductAndVariant(tx, tenantId, existing.productId, existing.variantId);
  if (!loaded) return fail("ไม่พบสินค้า", "not_found");
  const available = lineAvailability(loaded.product, loaded.variant);
  const finalQty = available === null ? Math.min(q, 99) : Math.min(q, Math.max(0, available), 99);
  if (finalQty <= 0) return fail("สินค้าหมด", "out_of_stock");
  await tx.update(cartItems).set({ quantity: finalQty }).where(eq(cartItems.id, existing.id));
  await touch(tx, cartId);
  return ok({ quantity: finalQty, adjusted: finalQty < q });
}

export async function removeCartItem(tx: Tx, tenantId: string, cartId: string, itemId: string): Promise<void> {
  await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.id, itemId)));
  await touch(tx, cartId);
}

export async function cartItemCount(tx: Tx, tenantId: string, token: string | null | undefined): Promise<number> {
  const cart = await findActiveCart(tx, tenantId, token);
  if (!cart) return 0;
  const [row] = await tx
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cart.id)));
  return Number(row?.n ?? 0);
}

/** Non-cancelled orders this customer placed with the coupon (for perCustomerLimit). */
export async function countCouponUsesByCustomer(tx: Tx, tenantId: string, code: string, customerId: string | null | undefined): Promise<number | null> {
  if (!customerId) return null;
  const [row] = await tx
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.customerId, customerId), eq(orders.couponCode, code), ne(orders.status, "cancelled")));
  return Number(row?.n ?? 0);
}

export async function findDiscountByCode(tx: Tx, tenantId: string, code: string): Promise<DiscountRow | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const [row] = await tx
    .select()
    .from(discounts)
    .where(and(eq(discounts.tenantId, tenantId), sql`upper(${discounts.code}) = ${normalized}`))
    .limit(1);
  return row ?? null;
}

/** Lines with live product/variant snapshots (prices are never stored in the cart). */
export async function loadCartLines(tx: Tx, tenantId: string, cartId: string): Promise<CartLine[]> {
  const rows = await tx
    .select({ item: cartItems, product: products, variant: productVariants })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId)))
    .orderBy(asc(cartItems.createdAt));

  // variant-less products with hasVariants=false don't need this; variant products use the picked variant
  return rows.map(({ item, product, variant }) => {
    const active = product.status === "active" && (!product.hasVariants || (!!variant && variant.active));
    const unitPrice = variant?.price ?? product.price;
    const available = product.hasVariants ? (variant ? variantAvailable(product, variant) : 0) : availableStock(product);
    return {
      id: item.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      slug: product.slug,
      variantTitle: variant?.title ?? null,
      sku: variant?.sku ?? product.sku,
      image: variant?.image ?? product.images?.[0]?.url ?? null,
      unitPrice,
      compareAtPrice: variant ? variant.compareAtPrice : product.compareAtPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      available,
      weightGrams: variant?.weightGrams ?? product.weightGrams ?? 0,
      type: product.type,
      categoryId: product.categoryId,
      active,
    };
  });
}

/** Full cart view for the UI (null when the cookie has no live cart). */
export async function loadCart(tx: Tx, tenantId: string, token: string | null | undefined, opts: { customerId?: string | null } = {}): Promise<CartView | null> {
  const cart = await findActiveCart(tx, tenantId, token);
  if (!cart) return null;
  return buildCartView(tx, tenantId, cart, opts);
}

export async function buildCartView(tx: Tx, tenantId: string, cart: CartRow, opts: { customerId?: string | null } = {}): Promise<CartView> {
  const items = await loadCartLines(tx, tenantId, cart.id);
  let coupon: CouponEval | null = null;
  let couponError: string | null = null;
  if (cart.couponCode) {
    const d = await findDiscountByCode(tx, tenantId, cart.couponCode);
    if (!d) couponError = "โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ";
    else {
      const uses = await countCouponUsesByCustomer(tx, tenantId, d.code, opts.customerId ?? cart.customerId);
      const r = evaluateCoupon(d, { lines: items, customerUses: uses });
      if (r.ok) coupon = r.value;
      else couponError = r.error;
    }
  }
  const totals = computeTotals(items, coupon);
  return { id: cart.id, token: cart.token, couponCode: cart.couponCode, coupon, couponError, items, ...totals };
}

/** Validates and stores a coupon on the cart. */
export async function applyCoupon(tx: Tx, tenantId: string, cartId: string, code: string, opts: { customerId?: string | null } = {}): Promise<Result<CouponEval>> {
  const d = await findDiscountByCode(tx, tenantId, code);
  if (!d) return fail("โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ", "not_found");
  const lines = await loadCartLines(tx, tenantId, cartId);
  if (!lines.length) return fail("ตะกร้าว่าง", "empty");
  const uses = await countCouponUsesByCustomer(tx, tenantId, d.code, opts.customerId);
  const r = evaluateCoupon(d, { lines, customerUses: uses });
  if (!r.ok) return r;
  await tx.update(carts).set({ couponCode: d.code, expiresAt: expiry() }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId)));
  return r;
}

export async function removeCoupon(tx: Tx, tenantId: string, cartId: string): Promise<void> {
  await tx.update(carts).set({ couponCode: null }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId)));
}

export async function clearCart(tx: Tx, tenantId: string, cartId: string): Promise<void> {
  await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId)));
}

/** Marks a cart converted after checkout. */
export async function markCartConverted(tx: Tx, tenantId: string, cartId: string): Promise<void> {
  await tx.update(carts).set({ status: "converted" }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId)));
}

/** Variants for a set of products (used by cart UI to show option names). */
export async function variantsForProducts(tx: Tx, tenantId: string, productIds: string[]): Promise<VariantRow[]> {
  if (!productIds.length) return [];
  return tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.productId, productIds)));
}
