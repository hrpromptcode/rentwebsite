import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import { emitEvent, fail, normalizeThaiPhone, ok, randomToken, type Result } from "@rentweb/core";
import { upsertGuestCustomer, type CustomerSummary } from "@rentweb/core/customer";
import { createPayment, paymentSettings, resolvePromptpayId, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";
import { buildCartView, countCouponUsesByCustomer, evaluateCoupon, findActiveCart, findDiscountByCode, markCartConverted, type CartLine, type CouponEval } from "./cart";
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

function tracked(line: Pick<CartLine, "type">, product: Pick<typeof products.$inferSelect, "trackInventory">): boolean {
  return product.trackInventory && line.type !== "service";
}

export function formatOrderNumber(n: number): string {
  return `#${n}`;
}

/**
 * Converts the cart into an order inside the caller's tenant transaction:
 * validates stock (rows locked), snapshots items, decrements stock, writes inventory movements,
 * bumps coupon usage, converts the cart, emits order.created and opens a payment.
 * Expected failures (empty cart, stock) are returned as Result — nothing has been written at that point.
 */
export async function createOrderFromCart(tx: Tx, tenantId: string, input: CreateOrderInput): Promise<Result<CreateOrderResult>> {
  const cart = await findActiveCart(tx, tenantId, input.cartToken);
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
  if (!quote.isPickup && !input.address) return fail("กรุณากรอกที่อยู่จัดส่ง", "address");

  // --- lock products / variants and validate stock -----------------------
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);
  const lockedProducts = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))).for("update");
  const lockedVariants = variantIds.length
    ? await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, variantIds))).for("update")
    : [];
  const pById = new Map(lockedProducts.map((p) => [p.id, p]));
  const vById = new Map(lockedVariants.map((v) => [v.id, v]));
  for (const line of lines) {
    const p = pById.get(line.productId);
    if (!p || p.status !== "active") return fail(`${line.name} ไม่พร้อมจำหน่ายแล้ว`, "unavailable");
    if (!tracked(line, p)) continue;
    const have = line.variantId ? (vById.get(line.variantId)?.stock ?? 0) : p.stock;
    if (have < line.quantity) {
      const label = line.variantTitle ? `${line.name} (${line.variantTitle})` : line.name;
      return fail(have <= 0 ? `${label} สินค้าหมด` : `${label} เหลือเพียง ${have} ชิ้น`, "out_of_stock");
    }
  }

  // --- coupon (re-validated with the resolved customer) -------------------
  let coupon: CouponEval | null = null;
  if (cart.couponCode) {
    const d = await findDiscountByCode(tx, tenantId, cart.couponCode);
    if (d) {
      const uses = await countCouponUsesByCustomer(tx, tenantId, d.code, input.customer?.id ?? null);
      const r = evaluateCoupon(d, { lines, customerUses: uses });
      if (r.ok) coupon = r.value;
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
      await tx.update(productVariants).set({ stock: sql`${productVariants.stock} - ${line.quantity}` }).where(eq(productVariants.id, line.variantId));
    } else {
      await tx.update(products).set({ stock: sql`${products.stock} - ${line.quantity}` }).where(eq(products.id, line.productId));
    }
    await tx.insert(inventoryMovements).values({ tenantId, productId: line.productId, variantId: line.variantId, delta: -line.quantity, reason: "sale", refType: "order", refId: orderId });
  }

  if (coupon) {
    await tx.update(discounts).set({ usedCount: sql`${discounts.usedCount} + 1` }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.code, coupon.code)));
  }

  await markCartConverted(tx, tenantId, cart.id);
  await emitEvent(tx, { tenantId, type: "order.created", payload: { orderId, number, total, customerId, paymentMethod: input.paymentMethod } });

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
    .set({ metadata: { ...(order!.metadata ?? {}), paymentId: payment.id } })
    .where(eq(orders.id, orderId));

  return ok({ orderId, number, accessKey, paymentId: payment.id, total, paymentMethod: input.paymentMethod });
}

/** Payment handler (registered for refType "order"). Idempotent: a paid order is left untouched. */
export async function onOrderPaid(tx: Tx, payment: PaymentRow): Promise<void> {
  const tenantId = payment.tenantId;
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, payment.refId))).limit(1);
  if (!order || order.paymentStatus === "paid") return;
  const now = payment.paidAt ?? new Date();
  await tx
    .update(orders)
    .set({ paymentStatus: "paid", paidAt: now, status: order.status === "pending" ? "confirmed" : order.status })
    .where(eq(orders.id, order.id));
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
  await emitEvent(tx, { tenantId, type: "order.paid", payload: { orderId: order.id, number: order.number, total: order.total, customerId: order.customerId, paymentId: payment.id } });
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

function canAccess(order: OrderRow, access: OrderAccess): boolean {
  const meta = (order.metadata ?? {}) as { accessKey?: string };
  if (access.accessKey && meta.accessKey && access.accessKey === meta.accessKey) return true;
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
  if (order.status === "shipped" || order.status === "completed") return fail("คำสั่งซื้อถูกจัดส่งแล้ว ไม่สามารถยกเลิกได้", "shipped");

  const items = await tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];
  const prods = productIds.length ? await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))) : [];
  const pById = new Map(prods.map((p) => [p.id, p]));
  for (const it of items) {
    if (!it.productId) continue;
    const p = pById.get(it.productId);
    if (!p || !p.trackInventory || it.type === "service") continue;
    if (it.variantId) {
      await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${it.quantity}` }).where(eq(productVariants.id, it.variantId));
    } else {
      await tx.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.productId));
    }
    await tx.insert(inventoryMovements).values({ tenantId, productId: it.productId, variantId: it.variantId, delta: it.quantity, reason: "release", refType: "order", refId: order.id, note: "ลูกค้ายกเลิกคำสั่งซื้อ" });
  }
  if (order.couponCode) {
    await tx.update(discounts).set({ usedCount: sql`greatest(${discounts.usedCount} - 1, 0)` }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.code, order.couponCode)));
  }
  await tx
    .update(payments)
    .set({ status: "cancelled" })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, order.id), inArray(payments.status, ["pending", "pending_verification"])));
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "ลูกค้ายกเลิก" }).where(eq(orders.id, order.id));
  await emitEvent(tx, { tenantId, type: "order.cancelled", payload: { orderId: order.id, number: order.number, by: "customer" } });
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
