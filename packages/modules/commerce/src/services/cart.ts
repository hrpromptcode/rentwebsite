import { and, asc, count, desc, eq, gt, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { cartItems, carts, discounts, orders, productVariants, products, type Tx } from "@rentweb/db";
import { fail, normalizeThaiPhone, ok, randomToken, thb, type Result } from "@rentweb/core";
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

function isLive(c: CartRow, now = new Date()): boolean {
  return c.status === "active" && (!c.expiresAt || c.expiresAt > now);
}

export interface FindCartOptions {
  /**
   * Signed-in customer: their carts on other devices are merged into the one returned (SS-12), and a cookie
   * cart that belongs to a different customer is not used. The returned cart's token may then differ from the
   * cookie token; route handlers should re-set the cookie (getOrCreateCart reports it as `created`).
   */
  customerId?: string | null;
  /** SELECT … FOR UPDATE: serialises checkout / concurrent cart writes on the cart row (COR-04/COR-05). */
  lock?: boolean;
}

/** Cart for a cookie token, following "merged" pointers (max 3 hops) to the cart it was merged into. */
async function cartByToken(tx: Tx, tenantId: string, token: string, lock: boolean): Promise<CartRow | null> {
  const q = tx.select().from(carts).where(and(eq(carts.tenantId, tenantId), eq(carts.token, token))).limit(1);
  let [row] = lock ? await q.for("update") : await q;
  for (let hop = 0; row && row.status === "merged" && row.mergedIntoId && hop < 3; hop++) {
    const next = tx.select().from(carts).where(and(eq(carts.tenantId, tenantId), eq(carts.id, row.mergedIntoId))).limit(1);
    [row] = lock ? await next.for("update") : await next;
  }
  return row && isLive(row) ? row : null;
}

/** Active, unexpired cart for a cookie token (null when missing). See FindCartOptions for customer merging and locking. */
export async function findActiveCart(tx: Tx, tenantId: string, token: string | null | undefined, opts: FindCartOptions = {}): Promise<CartRow | null> {
  const own = token ? await cartByToken(tx, tenantId, token, !!opts.lock) : null;
  if (!opts.customerId) return own;
  const usable = own && (!own.customerId || own.customerId === opts.customerId) ? own : null;
  return mergeCustomerCarts(tx, tenantId, opts.customerId, usable);
}

/**
 * SS-12: one cart per signed-in customer across devices. The cookie cart (or else the customer's most recent
 * cart) survives; the customer's other active carts are merged into it (quantities summed, capped by stock and
 * 99) and marked `merged` with a pointer to the survivor, so the other device's cookie keeps resolving.
 */
export async function mergeCustomerCarts(tx: Tx, tenantId: string, customerId: string, own: CartRow | null): Promise<CartRow | null> {
  const now = new Date();
  const conds = [eq(carts.tenantId, tenantId), eq(carts.customerId, customerId), eq(carts.status, "active"), or(isNull(carts.expiresAt), gt(carts.expiresAt, now))];
  if (own) conds.push(ne(carts.id, own.id));
  const others = await tx.select().from(carts).where(and(...conds)).orderBy(desc(carts.updatedAt), desc(carts.createdAt));
  if (!others.length) {
    if (own && own.customerId !== customerId) {
      const [upd] = await tx.update(carts).set({ customerId, expiresAt: expiry() }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, own.id))).returning();
      return upd ?? own;
    }
    return own;
  }
  const survivorId = own?.id ?? others[0]!.id;
  const ids = [...new Set([survivorId, ...others.map((o) => o.id)])].sort();
  // lock every cart involved in a fixed order (two devices may merge at the same time)
  const locked = await tx.select().from(carts).where(and(eq(carts.tenantId, tenantId), inArray(carts.id, ids))).orderBy(asc(carts.id)).for("update");
  const survivor = locked.find((c) => c.id === survivorId && isLive(c, now)) ?? locked.find((c) => c.customerId === customerId && isLive(c, now));
  if (!survivor) return null;
  const donors = locked.filter((c) => c.id !== survivor.id && c.customerId === customerId && isLive(c, now));
  let couponCode = survivor.couponCode;
  for (const donor of donors) {
    const [mine, theirs] = await Promise.all([
      tx.select().from(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, survivor.id))),
      tx.select().from(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, donor.id))).orderBy(asc(cartItems.createdAt)),
    ]);
    for (const item of theirs) {
      const same = mine.find((m) => m.productId === item.productId && (m.variantId ?? null) === (item.variantId ?? null));
      const loaded = await loadProductAndVariant(tx, tenantId, item.productId, item.variantId);
      const available = loaded ? lineAvailability(loaded.product, loaded.variant) : 0;
      const wanted = Math.min(99, (same?.quantity ?? 0) + item.quantity);
      const qty = available === null ? wanted : Math.min(wanted, Math.max(available, same?.quantity ?? 0));
      if (same) {
        if (qty !== same.quantity) await tx.update(cartItems).set({ quantity: qty }).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, same.id)));
        same.quantity = qty;
        await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, item.id)));
      } else if (qty > 0) {
        await tx.update(cartItems).set({ cartId: survivor.id, quantity: qty }).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, item.id)));
        mine.push({ ...item, cartId: survivor.id, quantity: qty });
      } else {
        await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, item.id)));
      }
    }
    couponCode = couponCode ?? donor.couponCode;
    await tx.update(carts).set({ status: "merged", mergedIntoId: survivor.id }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, donor.id)));
  }
  const [upd] = await tx
    .update(carts)
    .set({ customerId, couponCode, expiresAt: expiry() })
    .where(and(eq(carts.tenantId, tenantId), eq(carts.id, survivor.id)))
    .returning();
  return upd ?? survivor;
}

/**
 * Lazily creates the cart. `created` = the caller must (re)set the cookie: a new cart, or a signed-in
 * customer whose cart lives under another token (merged from another device).
 */
export async function getOrCreateCart(tx: Tx, tenantId: string, token: string | null | undefined, customerId?: string | null): Promise<{ cart: CartRow; created: boolean }> {
  const existing = await findActiveCart(tx, tenantId, token, { customerId: customerId ?? null });
  if (existing) return { cart: existing, created: existing.token !== token };
  const [cart] = await tx
    .insert(carts)
    .values({ tenantId, token: randomToken(24), status: "active", customerId: customerId ?? null, expiresAt: expiry() })
    .returning();
  return { cart: cart!, created: true };
}

async function touch(tx: Tx, tenantId: string, cartId: string) {
  await tx.update(carts).set({ expiresAt: expiry() }).where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId)));
}

/** Row lock on the cart: concurrent add/update requests for one cart run one after another (COR-04). */
async function lockCart(tx: Tx, tenantId: string, cartId: string): Promise<CartRow | null> {
  const [row] = await tx.select().from(carts).where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId))).limit(1).for("update");
  return row ?? null;
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
  const cart = await lockCart(tx, tenantId, cartId);
  if (!cart || cart.status !== "active") return fail("ไม่พบตะกร้า กรุณาลองใหม่อีกครั้ง", "not_found");
  const loaded = await loadProductAndVariant(tx, tenantId, input.productId, input.variantId ?? null);
  if (!loaded || loaded.product.status !== "active") return fail("ไม่พบสินค้า", "not_found");
  const { product, variant } = loaded;
  if (product.hasVariants && !variant) return fail("กรุณาเลือกตัวเลือกสินค้า", "variant_required");
  if (variant && !variant.active) return fail("ตัวเลือกนี้ไม่พร้อมจำหน่าย", "variant_inactive");

  // read after the cart lock: a concurrent add of the same line has committed by now and is merged into
  const [existing] = await tx
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.productId, product.id), variant ? eq(cartItems.variantId, variant.id) : isNull(cartItems.variantId)))
    .limit(1);

  const available = lineAvailability(product, variant);
  const wanted = Math.min(99, (existing?.quantity ?? 0) + qty);
  if (available !== null && available <= 0) return fail("สินค้าหมด", "out_of_stock");
  const finalQty = available === null ? wanted : Math.min(wanted, available);
  const adjusted = finalQty < (existing?.quantity ?? 0) + qty;
  if (existing && finalQty <= existing.quantity) return fail(available === null ? "สินค้าในตะกร้าครบจำนวนสูงสุดแล้ว (99 ชิ้น)" : `มีสินค้าในตะกร้าครบตามสต็อกแล้ว (${available} ชิ้น)`, "out_of_stock");

  let item: CartItemRow;
  if (existing) {
    [item] = (await tx.update(cartItems).set({ quantity: finalQty }).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, existing.id))).returning()) as [CartItemRow];
  } else {
    [item] = (await tx
      .insert(cartItems)
      .values({ tenantId, cartId, productId: product.id, variantId: variant?.id ?? null, quantity: finalQty })
      .returning()) as [CartItemRow];
  }
  await touch(tx, tenantId, cartId);
  return ok({ item, adjusted });
}

/** Set a line quantity (0 removes). Caps to stock. */
export async function updateCartItem(tx: Tx, tenantId: string, cartId: string, itemId: string, quantity: number): Promise<Result<{ quantity: number; adjusted: boolean }>> {
  await lockCart(tx, tenantId, cartId);
  const [existing] = await tx.select().from(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.id, itemId))).limit(1);
  if (!existing) return fail("ไม่พบรายการในตะกร้า", "not_found");
  const q = Math.floor(quantity);
  if (q <= 0) {
    await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, existing.id)));
    await touch(tx, tenantId, cartId);
    return ok({ quantity: 0, adjusted: false });
  }
  const loaded = await loadProductAndVariant(tx, tenantId, existing.productId, existing.variantId);
  if (!loaded) return fail("ไม่พบสินค้า", "not_found");
  const available = lineAvailability(loaded.product, loaded.variant);
  const finalQty = available === null ? Math.min(q, 99) : Math.min(q, Math.max(0, available), 99);
  if (finalQty <= 0) return fail("สินค้าหมด", "out_of_stock");
  await tx.update(cartItems).set({ quantity: finalQty }).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.id, existing.id)));
  await touch(tx, tenantId, cartId);
  return ok({ quantity: finalQty, adjusted: finalQty < q });
}

export async function removeCartItem(tx: Tx, tenantId: string, cartId: string, itemId: string): Promise<void> {
  await tx.delete(cartItems).where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cartId), eq(cartItems.id, itemId)));
  await touch(tx, tenantId, cartId);
}

export async function cartItemCount(tx: Tx, tenantId: string, token: string | null | undefined, opts: { customerId?: string | null } = {}): Promise<number> {
  const cart = await findActiveCart(tx, tenantId, token, opts);
  if (!cart) return 0;
  const [row] = await tx
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(and(eq(cartItems.tenantId, tenantId), eq(cartItems.cartId, cart.id)));
  return Number(row?.n ?? 0);
}

export interface CouponUser {
  customerId?: string | null;
  /** contact phone of the order (any format; normalised) */
  phone?: string | null;
  email?: string | null;
}

/**
 * Orders that used the coupon and still count against perCustomerLimit: placed by the customer OR with the
 * same normalised phone / e-mail (COR-03: guests are matched by their contact too). Cancelled orders and orders
 * whose coupon use was released (metadata.couponReleased) do not count. null = nobody to match (no limit check).
 */
export async function countCouponUses(tx: Tx, tenantId: string, code: string, who: CouponUser): Promise<number | null> {
  const ors = [];
  if (who.customerId) ors.push(eq(orders.customerId, who.customerId));
  const phone = who.phone ? (normalizeThaiPhone(who.phone) ?? who.phone.trim()) : null;
  if (phone) ors.push(eq(orders.phone, phone));
  const email = who.email?.trim().toLowerCase() || null;
  if (email) ors.push(eq(orders.email, email));
  if (!ors.length) return null;
  const [row] = await tx
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        sql`upper(${orders.couponCode}) = ${code.trim().toUpperCase()}`,
        ne(orders.status, "cancelled"),
        sql`coalesce(${orders.metadata}->>'couponReleased', 'false') <> 'true'`,
        or(...ors),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Orders this signed-in customer placed with the coupon (for perCustomerLimit; see countCouponUses). */
export async function countCouponUsesByCustomer(tx: Tx, tenantId: string, code: string, customerId: string | null | undefined): Promise<number | null> {
  return countCouponUses(tx, tenantId, code, { customerId });
}

export async function findDiscountByCode(tx: Tx, tenantId: string, code: string, opts: { lock?: boolean } = {}): Promise<DiscountRow | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const q = tx
    .select()
    .from(discounts)
    .where(and(eq(discounts.tenantId, tenantId), sql`upper(${discounts.code}) = ${normalized}`))
    .limit(1);
  const [row] = opts.lock ? await q.for("update") : await q;
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

/**
 * Full cart view for the UI (null when the cookie has no live cart). With a signed-in customer the carts of
 * their other devices are merged in (SS-12); the view's token is then the surviving cart's token.
 */
export async function loadCart(tx: Tx, tenantId: string, token: string | null | undefined, opts: { customerId?: string | null } = {}): Promise<CartView | null> {
  const cart = await findActiveCart(tx, tenantId, token, { customerId: opts.customerId ?? null });
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

/** Marks an active cart converted after checkout; false when it was not active any more (converted / merged meanwhile). */
export async function markCartConverted(tx: Tx, tenantId: string, cartId: string): Promise<boolean> {
  const r = await tx
    .update(carts)
    .set({ status: "converted" })
    .where(and(eq(carts.tenantId, tenantId), eq(carts.id, cartId), eq(carts.status, "active")))
    .returning({ id: carts.id });
  return r.length > 0;
}

/** Variants for a set of products (used by cart UI to show option names). */
export async function variantsForProducts(tx: Tx, tenantId: string, productIds: string[]): Promise<VariantRow[]> {
  if (!productIds.length) return [];
  return tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.productId, productIds)));
}
