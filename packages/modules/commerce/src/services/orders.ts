import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  customers,
  discounts,
  inventoryMovements,
  nextCounter,
  orderItems,
  orders,
  payments,
  productVariants,
  products,
  reviews,
  shipments,
  type AddressJson,
  type Tx,
} from "@rentweb/db";
import { emitEvent, fail, normalizeThaiPhone, ok, randomToken, safeEqual, type Result } from "@rentweb/core";
import { CUSTOMER_BLOCKED_CODE, CUSTOMER_BLOCKED_MESSAGE, isCustomerBlocked, upsertGuestCustomer, type CustomerSummary } from "@rentweb/core/customer";
import {
  cancelPayment,
  createPayment,
  paymentSettings,
  refundRequired,
  resolvePromptpayId,
  type PaymentClosedInfo,
  type PaymentMethod,
  type PaymentPaidResult,
  type PaymentProvider,
} from "@rentweb/core/payments";
import { buildCartView, countCouponUses, evaluateCoupon, findActiveCart, findDiscountByCode, markCartConverted, removeCoupon, type CartLine, type CouponEval } from "./cart";
import { getShippingMethod, toQuote, type ShippingQuote } from "./shipping";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type ShipmentRow = typeof shipments.$inferSelect;

export type CheckoutPaymentMethod = "promptpay_qr" | "slip" | "cod" | "cash" | "card" | "wallet";

const PROVIDER_FOR: Record<CheckoutPaymentMethod, PaymentProvider> = {
  promptpay_qr: "promptpay",
  slip: "bank_transfer",
  cod: "cod",
  cash: "cash",
  card: "opn",
  wallet: "wallet",
};

/** Shown when a shop has no way to receive money yet (no PromptPay ID / bank account, nothing else enabled). */
export const NO_PAYMENT_RECEIVER_MESSAGE = "ร้านค้ายังไม่ได้ตั้งค่าช่องทางรับชำระเงิน (พร้อมเพย์หรือบัญชีธนาคาร) จึงยังสั่งซื้อออนไลน์ไม่ได้ในขณะนี้ กรุณาติดต่อร้านค้าโดยตรง";
export const PAYMENT_METHOD_DISABLED_MESSAGE = "ร้านค้าไม่ได้เปิดรับชำระเงินด้วยวิธีนี้ กรุณาเลือกวิธีชำระเงินอื่น";

/**
 * Payment methods the storefront checkout may use (COR-23): enabled in settings.payments.enabled AND able to
 * receive money — PromptPay QR needs a PromptPay ID, bank-transfer slips need at least one bank account. Unlike
 * core enabledMethods() there is no "slip" fallback when nothing is configured, and card / wallet are never
 * offered because shop orders have no online card / wallet flow. COD additionally needs a COD shipping method,
 * cash a pickup method (checked in createOrderFromCart).
 */
export function checkoutPaymentMethods(settings: Record<string, unknown>): CheckoutPaymentMethod[] {
  const p = paymentSettings(settings);
  const e = p.enabled ?? {};
  const out: CheckoutPaymentMethod[] = [];
  if ((e.promptpay ?? true) && resolvePromptpayId(settings)) out.push("promptpay_qr");
  if ((e.bankTransfer ?? true) && (p.bankAccounts ?? []).some((a) => !!a?.number?.trim())) out.push("slip");
  if (e.cod) out.push("cod");
  if (e.cash) out.push("cash");
  return out;
}

export interface CreateOrderInput {
  cartToken: string;
  /** signed-in customer, or null for guest checkout */
  customer: Pick<CustomerSummary, "id" | "name" | "phone" | "email"> | null;
  contact: { name: string; phone: string; email?: string | null };
  /** null for pickup */
  address: AddressJson | null;
  shippingMethodId: string;
  paymentMethod: CheckoutPaymentMethod;
  note?: string | null;
  /** tenant settings (payments block) */
  settings: Record<string, unknown>;
  source?: string;
}

export interface CreateOrderResult {
  orderId: string;
  number: string;
  accessKey: string;
  paymentId: string;
  total: number;
  paymentMethod: CheckoutPaymentMethod;
}

/** Commerce bookkeeping kept in orders.metadata (all optional; older orders have none of the flags). */
export interface OrderMeta {
  accessKey?: string;
  paymentId?: string;
  paymentMethod?: string;
  /** onOrderPaid added this order to products.soldCount / customer stats */
  salesCounted?: boolean;
  /** the stock reserved at checkout went back to inventory (cancel / expiry / refund before shipping) */
  stockReleased?: boolean;
  /** discounts.usedCount was decremented for this order's coupon */
  couponReleased?: boolean;
  /** salesCounted was reversed */
  salesReversed?: boolean;
  [k: string]: unknown;
}

export function orderMeta(order: Pick<OrderRow, "metadata">): OrderMeta {
  return (order.metadata ?? {}) as OrderMeta;
}

/** jsonb merge (`metadata || patch`) — never overwrites keys written by another statement in between. */
function metaPatch(patch: Partial<OrderMeta>) {
  return sql`coalesce(${orders.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;
}

function tracked(line: Pick<CartLine, "type">, product: Pick<typeof products.$inferSelect, "trackInventory">): boolean {
  return product.trackInventory && line.type !== "service";
}

export function formatOrderNumber(n: number): string {
  return `#${n}`;
}

/**
 * Converts the cart into an order inside the caller's tenant transaction:
 * locks the cart (a double submit waits and then finds it converted), validates stock per product / variant
 * total (rows locked in id order), snapshots items, decrements stock, writes inventory movements, re-validates
 * and bumps the coupon under a row lock, converts the cart, emits order.created and opens a payment.
 * Expected failures (empty cart, stock, payment method, coupon) are returned as Result; the only write before
 * such a failure is dropping a coupon that stopped being valid (so the next attempt shows the real total).
 */
export async function createOrderFromCart(tx: Tx, tenantId: string, input: CreateOrderInput): Promise<Result<CreateOrderResult>> {
  // --- payment method (COR-23) ---------------------------------------------
  const allowed = checkoutPaymentMethods(input.settings);
  if (!allowed.length) return fail(NO_PAYMENT_RECEIVER_MESSAGE, "payment_unavailable");
  if (!allowed.includes(input.paymentMethod)) return fail(PAYMENT_METHOD_DISABLED_MESSAGE, "payment_method");

  // --- blocked customer (ADMIN_B2-13): signed in, or a guest whose phone / e-mail belongs to a blocked record ---
  if (await isCustomerBlocked(tx, tenantId, { customerId: input.customer?.id ?? null, phone: input.contact.phone, email: input.contact.email })) {
    return fail(CUSTOMER_BLOCKED_MESSAGE, CUSTOMER_BLOCKED_CODE);
  }

  // --- cart: row lock first (COR-05 double submit) ---------------------------
  const cart = await findActiveCart(tx, tenantId, input.cartToken, { customerId: input.customer?.id ?? null, lock: true });
  if (!cart) return fail("ตะกร้าว่าง กรุณาเลือกสินค้าก่อนชำระเงิน", "empty");
  const view = await buildCartView(tx, tenantId, cart, { customerId: input.customer?.id ?? null });
  const lines = view.items.filter((l) => l.active);
  if (!lines.length) return fail("ตะกร้าว่าง กรุณาเลือกสินค้าก่อนชำระเงิน", "empty");

  // --- shipping ----------------------------------------------------------
  const method = await getShippingMethod(tx, tenantId, input.shippingMethodId);
  if (!method) return fail("กรุณาเลือกวิธีจัดส่ง", "shipping");
  const quote: ShippingQuote | null = toQuote(method, { subtotal: view.total, weightGrams: view.weightGrams, freeShipping: view.freeShipping });
  if (!quote) return fail("วิธีจัดส่งนี้ไม่รองรับน้ำหนักพัสดุของคุณ", "shipping_unavailable");
  if (quote.requiresCod && input.paymentMethod !== "cod") return fail("วิธีจัดส่งนี้ชำระแบบเก็บเงินปลายทางเท่านั้น", "cod_required");
  if (!quote.requiresCod && input.paymentMethod === "cod") return fail("เก็บเงินปลายทางใช้ได้กับการจัดส่งแบบ COD เท่านั้น", "cod_not_allowed");
  if (input.paymentMethod === "cash" && !quote.isPickup) return fail("ชำระเงินสดได้เฉพาะเมื่อรับสินค้าที่ร้าน", "cash_pickup_only");
  if (!quote.isPickup && !input.address) return fail("กรุณากรอกที่อยู่จัดส่ง", "address");

  // --- lock products / variants (fixed order) and validate stock per product/variant total (COR-04) ---
  const productIds = [...new Set(lines.map((l) => l.productId))].sort();
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => !!v))].sort();
  const lockedProducts = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))).orderBy(asc(products.id)).for("update");
  const lockedVariants = variantIds.length
    ? await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, variantIds))).orderBy(asc(productVariants.id)).for("update")
    : [];
  const pById = new Map(lockedProducts.map((p) => [p.id, p]));
  const vById = new Map(lockedVariants.map((v) => [v.id, v]));
  const stockKey = (l: Pick<CartLine, "productId" | "variantId">) => (l.variantId ? `v:${l.variantId}` : `p:${l.productId}`);
  const need = new Map<string, number>();
  for (const line of lines) {
    const p = pById.get(line.productId);
    if (!p || p.status !== "active") return fail(`${line.name} ไม่พร้อมจำหน่ายแล้ว`, "unavailable");
    if (line.variantId) {
      const v = vById.get(line.variantId);
      if (!v || !v.active || v.productId !== p.id) return fail(`${line.name} ไม่พร้อมจำหน่ายแล้ว`, "unavailable");
    }
    if (!tracked(line, p)) continue;
    need.set(stockKey(line), (need.get(stockKey(line)) ?? 0) + line.quantity);
  }
  for (const line of lines) {
    const p = pById.get(line.productId)!;
    if (!tracked(line, p)) continue;
    const have = line.variantId ? (vById.get(line.variantId)?.stock ?? 0) : p.stock;
    if (have < need.get(stockKey(line))!) {
      const label = line.variantTitle ? `${line.name} (${line.variantTitle})` : line.name;
      return fail(have <= 0 ? `${label} สินค้าหมด` : `${label} เหลือเพียง ${have} ชิ้น`, "out_of_stock");
    }
  }

  // --- coupon: re-validated under a row lock with the order's contact (COR-03 / COR-06) ---
  let coupon: CouponEval | null = null;
  let discountId: string | null = null;
  if (cart.couponCode) {
    const d = await findDiscountByCode(tx, tenantId, cart.couponCode, { lock: true });
    const uses = d ? await countCouponUses(tx, tenantId, d.code, { customerId: input.customer?.id ?? null, phone: input.contact.phone, email: input.contact.email }) : null;
    const r = d ? evaluateCoupon(d, { lines, customerUses: uses }) : fail("โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ", "not_found");
    if (r.ok) {
      coupon = r.value;
      discountId = d!.id;
    } else {
      // never silently charge a different total than the checkout page showed: drop the code and say why
      await removeCoupon(tx, tenantId, cart.id);
      return fail(`ใช้โค้ด ${cart.couponCode} ไม่ได้: ${r.error} ระบบนำโค้ดออกจากตะกร้าแล้ว กรุณาตรวจสอบยอดชำระแล้วกดสั่งซื้ออีกครั้ง`, "coupon");
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discountTotal = Math.min(subtotal, coupon?.amount ?? 0);
  const shippingBase = coupon?.freeShipping ? 0 : quote.amount;
  const shippingTotal = shippingBase + quote.codFee;
  const total = subtotal - discountTotal + shippingTotal;

  // --- customer -------------------------------------------------------------
  let customerId: string | null = input.customer?.id ?? null;
  if (!customerId) {
    const guest = await upsertGuestCustomer(tx, tenantId, { phone: input.contact.phone, email: input.contact.email, name: input.contact.name });
    customerId = guest?.id ?? null;
  }

  // --- order ---------------------------------------------------------------
  const seq = await nextCounter(tx, tenantId, "order", 1000);
  const number = formatOrderNumber(seq);
  const accessKey = randomToken(16);
  const phone = normalizeThaiPhone(input.contact.phone) ?? input.contact.phone;
  const email = input.contact.email?.trim().toLowerCase() || null;
  const [order] = await tx
    .insert(orders)
    .values({
      tenantId,
      number,
      customerId,
      email,
      phone,
      customerName: input.contact.name,
      status: input.paymentMethod === "cod" ? "confirmed" : "pending",
      paymentStatus: "unpaid",
      fulfillmentStatus: "unfulfilled",
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal: 0,
      total,
      couponCode: coupon?.code ?? null,
      shippingMethodName: method.name,
      shippingMethodType: method.type,
      shippingAddress: input.address ?? (quote.isPickup ? { name: input.contact.name, phone, line1: method.name, country: "TH" } : null),
      customerNote: input.note?.trim() || null,
      source: input.source ?? "storefront",
      metadata: { accessKey, paymentMethod: input.paymentMethod, codFee: quote.codFee, shippingBase, shippingMethodId: method.id },
      placedAt: new Date(),
    })
    .returning();
  const orderId = order!.id;

  await tx.insert(orderItems).values(
    lines.map((l) => ({
      tenantId,
      orderId,
      productId: l.productId,
      variantId: l.variantId,
      name: l.name,
      variantTitle: l.variantTitle,
      sku: l.sku,
      image: l.image,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.lineTotal,
      type: l.type,
    })),
  );

  // --- stock -----------------------------------------------------------------
  for (const line of lines) {
    const p = pById.get(line.productId)!;
    if (!tracked(line, p)) continue;
    if (line.variantId) {
      await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} - ${line.quantity}` })
        .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, line.variantId)));
    } else {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}` })
        .where(and(eq(products.tenantId, tenantId), eq(products.id, line.productId)));
    }
    await tx.insert(inventoryMovements).values({ tenantId, productId: line.productId, variantId: line.variantId, delta: -line.quantity, reason: "sale", refType: "order", refId: orderId });
  }

  if (coupon && discountId) {
    // guarded bump: never past maxUses (the row is locked above, so this cannot lose a race)
    const bumped = await tx
      .update(discounts)
      .set({ usedCount: sql`${discounts.usedCount} + 1` })
      .where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, discountId), or(isNull(discounts.maxUses), lt(discounts.usedCount, discounts.maxUses))))
      .returning({ id: discounts.id });
    if (!bumped.length) throw new Error(`coupon ${coupon.code}: maxUses reached during checkout`);
  }

  if (!(await markCartConverted(tx, tenantId, cart.id))) throw new Error("cart was converted concurrently");
  await emitEvent(tx, { tenantId, type: "order.created", payload: { orderId, number, total, customerId, paymentMethod: input.paymentMethod, accessKey, email: order!.email, phone: order!.phone, customerName: order!.customerName } });

  // --- payment -------------------------------------------------------------
  const ps = paymentSettings(input.settings);
  const needsExpiry = input.paymentMethod === "promptpay_qr" || input.paymentMethod === "slip";
  const payment = await createPayment(tx, tenantId, {
    refType: "order",
    refId: orderId,
    amount: total,
    provider: PROVIDER_FOR[input.paymentMethod],
    method: input.paymentMethod as PaymentMethod,
    customerId,
    promptpayId: resolvePromptpayId(input.settings) ?? undefined,
    expiresMinutes: needsExpiry ? (ps.expiresMinutes ?? 30) : undefined,
    metadata: { orderNumber: number },
  });
  await tx
    .update(orders)
    .set({ metadata: metaPatch({ paymentId: payment.id }) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));

  return ok({ orderId, number, accessKey, paymentId: payment.id, total, paymentMethod: input.paymentMethod });
}

async function hasStockRelease(tx: Tx, tenantId: string, orderId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.tenantId, tenantId), eq(inventoryMovements.refType, "order"), eq(inventoryMovements.refId, orderId), eq(inventoryMovements.reason, "release")))
    .limit(1);
  return !!row;
}

/** Voids the order's other open payments (pending / pending_verification) without re-running the closed handler. */
export async function voidOpenOrderPayments(tx: Tx, tenantId: string, orderId: string, reason: string, exceptPaymentId?: string | null): Promise<number> {
  const open = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, orderId), inArray(payments.status, ["pending", "pending_verification"])));
  let n = 0;
  for (const p of open) {
    if (p.id === exceptPaymentId) continue;
    await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
    n++;
  }
  return n;
}

export interface ReleaseResult {
  /** units put back into stock (0 when already released) */
  restocked: number;
  couponReleased: boolean;
  salesReversed: boolean;
}

/**
 * Gives back what an order holds when it ends without being fulfilled (customer / admin cancel, payment expiry,
 * full refund before shipping — COR-24): restocks tracked items (inventory movement "release"), releases the
 * coupon use and reverses soldCount / customer stats if the payment had counted them. Idempotent: every part
 * is recorded in orders.metadata (and a "release" movement), so calling it twice changes nothing.
 * The caller must hold the order row lock and decide the new order status.
 */
export async function releaseOrderReservation(tx: Tx, tenantId: string, order: OrderRow, opts: { note: string; actorId?: string | null }): Promise<ReleaseResult> {
  const meta = orderMeta(order);
  const out: ReleaseResult = { restocked: 0, couponReleased: false, salesReversed: false };
  const items = await tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  const patch: Partial<OrderMeta> = {};

  if (!meta.stockReleased && !(await hasStockRelease(tx, tenantId, order.id))) {
    const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))].sort();
    const prods = productIds.length ? await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))).orderBy(asc(products.id)).for("update") : [];
    const pById = new Map(prods.map((p) => [p.id, p]));
    for (const it of items) {
      if (!it.productId) continue;
      const p = pById.get(it.productId);
      if (!p || !p.trackInventory || it.type === "service") continue;
      if (it.variantId) {
        await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} + ${it.quantity}` })
          .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, it.variantId)));
      } else {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${it.quantity}` })
          .where(and(eq(products.tenantId, tenantId), eq(products.id, it.productId)));
      }
      await tx.insert(inventoryMovements).values({ tenantId, productId: it.productId, variantId: it.variantId, delta: it.quantity, reason: "release", refType: "order", refId: order.id, note: opts.note, createdBy: opts.actorId ?? null });
      out.restocked += it.quantity;
    }
  }
  patch.stockReleased = true;

  if (order.couponCode && !meta.couponReleased) {
    await tx
      .update(discounts)
      .set({ usedCount: sql`greatest(${discounts.usedCount} - 1, 0)` })
      .where(and(eq(discounts.tenantId, tenantId), sql`upper(${discounts.code}) = ${order.couponCode.toUpperCase()}`));
    patch.couponReleased = true;
    out.couponReleased = true;
  }

  const counted = meta.salesCounted ?? !!order.paidAt;
  if (counted && !meta.salesReversed) {
    for (const it of items) {
      if (!it.productId) continue;
      await tx
        .update(products)
        .set({ soldCount: sql`greatest(${products.soldCount} - ${it.quantity}, 0)` })
        .where(and(eq(products.tenantId, tenantId), eq(products.id, it.productId)));
    }
    if (order.customerId) {
      await tx
        .update(customers)
        .set({ ordersCount: sql`greatest(${customers.ordersCount} - 1, 0)`, totalSpent: sql`greatest(${customers.totalSpent} - ${order.total}, 0)` })
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, order.customerId)));
    }
    patch.salesReversed = true;
    out.salesReversed = true;
  }

  await tx
    .update(orders)
    .set({ metadata: metaPatch(patch) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, order.id)));
  return out;
}

const PAYABLE_PAYMENT_STATUSES = ["unpaid", "pending_verification", "failed"];

/**
 * Paid handler (registered for refType "order"), payments-api.md 3.1. Runs once per payment inside markPaid.
 * Refuses (→ payment flagged refundRequired, order untouched) when the order is missing, closed, already paid by
 * another payment (duplicate), refunded, or its stock was already released. A superseded but still valid payment
 * of an unpaid order is accepted and becomes the order's payment; the other open payments are voided.
 */
export async function onOrderPaid(tx: Tx, payment: PaymentRow): Promise<PaymentPaidResult> {
  const tenantId = payment.tenantId;
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, payment.refId))).limit(1).for("update");
  if (!order) return refundRequired("ไม่พบคำสั่งซื้อ");
  const meta = orderMeta(order);
  const isCurrent = !meta.paymentId || meta.paymentId === payment.id;
  if (order.paymentStatus === "paid") return isCurrent ? undefined : refundRequired(`ชำระซ้ำ: ออเดอร์ ${order.number} ชำระเงินแล้ว`);
  if (order.status === "cancelled" || order.status === "refunded") return refundRequired(`ออเดอร์ ${order.number} ถูกยกเลิกแล้ว`);
  if (!PAYABLE_PAYMENT_STATUSES.includes(order.paymentStatus)) return refundRequired(`ออเดอร์ ${order.number} คืนเงินแล้ว`);
  if (meta.stockReleased || (await hasStockRelease(tx, tenantId, order.id))) return refundRequired(`สินค้าของออเดอร์ ${order.number} ถูกคืนสต็อกแล้ว`);

  const now = payment.paidAt ?? new Date();
  await tx
    .update(orders)
    .set({ paymentStatus: "paid", paidAt: now, status: order.status === "pending" ? "confirmed" : order.status, metadata: metaPatch({ paymentId: payment.id, salesCounted: true }) })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, order.id)));
  // a QR / slip of the same order that is still open must not be payable any more
  await voidOpenOrderPayments(tx, tenantId, order.id, `ชำระแล้วด้วยรายการอื่น (${order.number})`, payment.id);
  const items = await tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  for (const it of items) {
    if (!it.productId) continue;
    await tx.update(products).set({ soldCount: sql`${products.soldCount} + ${it.quantity}` }).where(and(eq(products.tenantId, tenantId), eq(products.id, it.productId)));
  }
  if (order.customerId) {
    await tx
      .update(customers)
      .set({ ordersCount: sql`${customers.ordersCount} + 1`, totalSpent: sql`${customers.totalSpent} + ${order.total}` })
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, order.customerId)));
  }
  await emitEvent(tx, { tenantId, type: "order.paid", payload: { orderId: order.id, number: order.number, total: order.total, customerId: order.customerId, paymentId: payment.id, accessKey: meta.accessKey ?? null, email: order.email, phone: order.phone, customerName: order.customerName } });
}

/**
 * Closed handler (refType "order"), payments-api.md 3.2: the order's current payment was voided or expired
 * while the order was still waiting for it → cancel the order, restock, release the coupon. Superseded
 * payments, paid / shipped / COD-confirmed orders are left alone. Idempotent.
 */
export async function onOrderPaymentClosed(tx: Tx, payment: PaymentRow, info: PaymentClosedInfo): Promise<void> {
  const tenantId = payment.tenantId;
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, payment.refId))).limit(1).for("update");
  if (!order) return;
  const meta = orderMeta(order);
  if (meta.paymentId && meta.paymentId !== payment.id) return;
  if (order.status !== "pending" || !PAYABLE_PAYMENT_STATUSES.includes(order.paymentStatus)) return;
  const reason = info.status === "expired" ? "หมดเวลาชำระเงิน" : info.reason || "ยกเลิกการชำระเงิน";
  await releaseOrderReservation(tx, tenantId, order, { note: `ยกเลิกอัตโนมัติ: ${reason}` });
  await voidOpenOrderPayments(tx, tenantId, order.id, reason, payment.id);
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, order.id)));
  await emitEvent(tx, { tenantId, type: "order.cancelled", payload: { ...orderContactPayload(order), by: "system", reason } });
}

export function orderContactPayload(order: OrderRow) {
  const meta = orderMeta(order);
  return { orderId: order.id, number: order.number, customerId: order.customerId, email: order.email, phone: order.phone, customerName: order.customerName, accessKey: meta.accessKey ?? null, total: order.total };
}

export interface OrderAccess {
  customerId?: string | null;
  accessKey?: string | null;
}

export interface OrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
  payment: PaymentRow | null;
  shipments: ShipmentRow[];
  accessKey: string | null;
}

/** Owner or holder of the confirmation-link key (compared timing-safe, SEC-011). */
function canAccess(order: OrderRow, access: OrderAccess): boolean {
  const meta = orderMeta(order);
  if (access.accessKey && meta.accessKey && safeEqual(String(access.accessKey), String(meta.accessKey))) return true;
  if (access.customerId && order.customerId && access.customerId === order.customerId) return true;
  return false;
}

/** Order for the owner (signed in) or anyone holding the access key from the confirmation link. */
export async function getOrderForCustomer(tx: Tx, tenantId: string, orderId: string, access: OrderAccess): Promise<OrderDetail | null> {
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1);
  if (!order || !canAccess(order, access)) return null;
  const [items, pays, ships] = await Promise.all([
    tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id))).orderBy(asc(orderItems.createdAt)),
    tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, order.id))).orderBy(desc(payments.createdAt)),
    tx.select().from(shipments).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, order.id))).orderBy(desc(shipments.createdAt)),
  ]);
  const meta = (order.metadata ?? {}) as { accessKey?: string; paymentId?: string };
  const payment = pays.find((p) => p.id === meta.paymentId) ?? pays.find((p) => p.status === "paid") ?? pays[0] ?? null;
  return { order, items, payment, shipments: ships, accessKey: meta.accessKey ?? null };
}

export function normalizeOrderNumber(input: string): string {
  const digits = input.trim().replace(/^#/, "").replace(/\s+/g, "");
  return `#${digits}`;
}

/** Guest order lookup: number + the phone or email used at checkout. */
export async function findOrderByNumberAndContact(tx: Tx, tenantId: string, number: string, contact: string): Promise<{ id: string; accessKey: string | null } | null> {
  const n = normalizeOrderNumber(number);
  const c = contact.trim();
  if (!n || n === "#" || !c) return null;
  const cond = c.includes("@") ? eq(orders.email, c.toLowerCase()) : eq(orders.phone, normalizeThaiPhone(c) ?? c);
  const [row] = await tx
    .select({ id: orders.id, metadata: orders.metadata })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.number, n), cond))
    .limit(1);
  if (!row) return null;
  return { id: row.id, accessKey: ((row.metadata ?? {}) as { accessKey?: string }).accessKey ?? null };
}

export interface OrderSummary {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  total: number;
  placedAt: Date;
  itemCount: number;
  items: Array<{ name: string; image: string | null; quantity: number }>;
}

export async function listCustomerOrders(tx: Tx, tenantId: string, customerId: string, limit = 30): Promise<OrderSummary[]> {
  const rows = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)))
    .orderBy(desc(orders.placedAt))
    .limit(limit);
  if (!rows.length) return [];
  const items = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), inArray(orderItems.orderId, rows.map((r) => r.id))))
    .orderBy(asc(orderItems.createdAt));
  return rows.map((o) => {
    const mine = items.filter((i) => i.orderId === o.id);
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      placedAt: o.placedAt,
      itemCount: mine.reduce((s, i) => s + i.quantity, 0),
      items: mine.slice(0, 3).map((i) => ({ name: i.variantTitle ? `${i.name} (${i.variantTitle})` : i.name, image: i.image, quantity: i.quantity })),
    };
  });
}

/** Customer-initiated cancellation of an unpaid order: restocks items, voids pending payments, releases coupon use. */
export async function cancelUnpaidOrder(tx: Tx, tenantId: string, orderId: string, access: OrderAccess): Promise<Result<{ orderId: string }>> {
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1).for("update");
  if (!order || !canAccess(order, access)) return fail("ไม่พบคำสั่งซื้อ", "not_found");
  if (order.status === "cancelled") return fail("คำสั่งซื้อนี้ถูกยกเลิกแล้ว", "already_cancelled");
  if (order.paymentStatus !== "unpaid") return fail("คำสั่งซื้อนี้ชำระเงินแล้ว ไม่สามารถยกเลิกเองได้ กรุณาติดต่อร้าน", "paid");
  if (order.status === "shipped" || order.status === "completed" || order.status === "refunded") return fail("คำสั่งซื้อถูกจัดส่งแล้ว ไม่สามารถยกเลิกได้", "shipped");
  // a transferred slip waits for the shop: cancelling now would void money the customer already sent
  const [slip] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, order.id), eq(payments.status, "pending_verification")))
    .limit(1);
  if (slip) return fail("คำสั่งซื้อนี้แนบสลิปแล้วและรอร้านตรวจสอบ หากต้องการยกเลิกกรุณาติดต่อร้าน", "slip_pending");

  await releaseOrderReservation(tx, tenantId, order, { note: "ลูกค้ายกเลิกคำสั่งซื้อ" });
  await voidOpenOrderPayments(tx, tenantId, order.id, "ลูกค้ายกเลิกคำสั่งซื้อ");
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "ลูกค้ายกเลิก" }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, order.id)));
  await emitEvent(tx, { tenantId, type: "order.cancelled", payload: { ...orderContactPayload(order), by: "customer" } });
  return ok({ orderId: order.id });
}

export interface CreateReviewInput {
  productId: string;
  customerId?: string | null;
  orderId?: string | null;
  authorName: string;
  rating: number;
  title?: string | null;
  body?: string | null;
}

/** Reviews start as pending; the shop approves them in the admin. */
export async function createReview(tx: Tx, tenantId: string, input: CreateReviewInput): Promise<Result<typeof reviews.$inferSelect>> {
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) return fail("กรุณาให้คะแนน 1–5 ดาว", "rating");
  const name = input.authorName.trim();
  if (!name) return fail("กรุณากรอกชื่อ", "name");
  const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, input.productId))).limit(1);
  if (!product) return fail("ไม่พบสินค้า", "not_found");
  const [row] = await tx
    .insert(reviews)
    .values({
      tenantId,
      productId: input.productId,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      authorName: name,
      rating,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
      status: "pending",
    })
    .returning();
  await emitEvent(tx, { tenantId, type: "review.created", payload: { reviewId: row!.id, productId: input.productId } });
  return ok(row!);
}

/** Timeline step index used by the order page: 0 รอชำระ · 1 ชำระแล้ว · 2 กำลังจัดส่ง · 3 สำเร็จ */
export function orderStep(order: Pick<OrderRow, "status" | "paymentStatus">): number {
  if (order.status === "completed") return 3;
  if (order.status === "shipped") return 2;
  if (order.paymentStatus === "paid" || order.status === "confirmed" || order.status === "processing") return 1;
  return 0;
}
