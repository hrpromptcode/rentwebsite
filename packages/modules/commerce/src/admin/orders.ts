import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { customers, discounts, inventoryMovements, nextCounter, orderItems, orders, payments, productVariants, products, shipments, type AddressJson, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, normalizeThaiPhone, ok, randomToken, type Result } from "@rentweb/core";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { createPayment, markFailed, markPaid, refundPayment, resolvePromptpayId, paymentSettings, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";
import { getShippingMethod, toQuote } from "../services/shipping";
import { formatOrderNumber, type OrderItemRow, type OrderRow, type PaymentRow, type ShipmentRow } from "../services/orders";
import { trackingUrlFor, type OrderTab } from "./labels";
import type { manualOrderSchema, shipOrderSchema } from "./schemas";
import type { z } from "zod";

export interface Actor {
  userId: string;
  actorType: "user" | "superadmin";
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface OrderListFilters {
  tab?: OrderTab;
  q?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  /** YYYY-MM-DD (Asia/Bangkok) */
  from?: string | null;
  to?: string | null;
  page?: number;
  perPage?: number;
}

export interface OrderListRow {
  id: string;
  number: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  total: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippingMethodType: string | null;
  placedAt: Date;
  itemCount: number;
  /** a slip is waiting for verification */
  verifyPending: boolean;
}

export interface OrderListResult {
  rows: OrderListRow[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

const pendingSlipSub = (tenantId: string) =>
  exists(
    sql`(select 1 from ${payments} where ${payments.tenantId} = ${tenantId} and ${payments.refType} = 'order' and ${payments.refId} = ${orders.id} and ${payments.status} = 'pending_verification')`,
  );

function bangkokDay(d: string, endExclusive = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const base = new Date(`${d}T00:00:00+07:00`);
  if (Number.isNaN(base.getTime())) return null;
  return endExclusive ? new Date(base.getTime() + 86_400_000) : base;
}

function tabCondition(tenantId: string, tab: OrderTab | undefined): SQL | undefined {
  switch (tab) {
    case "verify":
      return or(eq(orders.paymentStatus, "pending_verification"), pendingSlipSub(tenantId));
    case "to_ship":
      return and(inArray(orders.status, ["confirmed", "processing"]), inArray(orders.fulfillmentStatus, ["unfulfilled", "partial"]));
    case "completed":
      return eq(orders.status, "completed");
    case "cancelled":
      return inArray(orders.status, ["cancelled", "refunded"]);
    default:
      return undefined;
  }
}

function listWhere(tenantId: string, f: OrderListFilters): SQL {
  const conds: SQL[] = [eq(orders.tenantId, tenantId)];
  const tab = tabCondition(tenantId, f.tab);
  if (tab) conds.push(tab);
  if (f.status) conds.push(eq(orders.status, f.status));
  if (f.paymentStatus) {
    if (f.paymentStatus === "pending_verification") conds.push(or(eq(orders.paymentStatus, "pending_verification"), pendingSlipSub(tenantId))!);
    else conds.push(eq(orders.paymentStatus, f.paymentStatus));
  }
  if (f.from) {
    const d = bangkokDay(f.from);
    if (d) conds.push(gte(orders.placedAt, d));
  }
  if (f.to) {
    const d = bangkokDay(f.to, true);
    if (d) conds.push(lt(orders.placedAt, d));
  }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const digits = q.replace(/[^0-9]/g, "");
    const parts: SQL[] = [ilike(orders.number, like), ilike(orders.customerName, like), ilike(orders.email, like)];
    if (digits.length >= 3) parts.push(ilike(orders.phone, `%${digits}%`));
    if (digits.length >= 1 && /^#?\d+$/.test(q)) parts.push(eq(orders.number, `#${digits}`));
    conds.push(or(...parts)!);
  }
  return and(...conds)!;
}

export async function listAdminOrders(tx: Tx, tenantId: string, f: OrderListFilters = {}): Promise<OrderListResult> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 20));
  const page = Math.max(1, f.page ?? 1);
  const where = listWhere(tenantId, f);
  const itemCountSub = sql<number>`(select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`;
  const [rows, [c]] = await Promise.all([
    tx
      .select({
        id: orders.id,
        number: orders.number,
        customerName: orders.customerName,
        phone: orders.phone,
        email: orders.email,
        total: orders.total,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        shippingMethodType: orders.shippingMethodType,
        placedAt: orders.placedAt,
        itemCount: itemCountSub,
        verifyPending: pendingSlipSub(tenantId),
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.placedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(orders).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map((r) => ({ ...r, itemCount: Number(r.itemCount), verifyPending: Boolean(r.verifyPending) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  };
}

export async function orderTabCounts(tx: Tx, tenantId: string): Promise<Record<OrderTab, number>> {
  const [row] = await tx
    .select({
      all: count(),
      verify: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'pending_verification' or ${pendingSlipSub(tenantId)})::int`,
      to_ship: sql<number>`count(*) filter (where ${orders.status} in ('confirmed','processing') and ${orders.fulfillmentStatus} in ('unfulfilled','partial'))::int`,
      completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('cancelled','refunded'))::int`,
    })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  return {
    all: Number(row?.all ?? 0),
    verify: Number(row?.verify ?? 0),
    to_ship: Number(row?.to_ship ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
  };
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  at: Date;
  label: string;
  detail?: string | null;
  tone: "default" | "success" | "warning" | "destructive";
}

export interface AdminOrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
  payments: PaymentRow[];
  shipments: ShipmentRow[];
  customer: { id: string; name: string | null; phone: string | null; email: string | null; ordersCount: number; totalSpent: number } | null;
  timeline: TimelineEntry[];
  accessKey: string | null;
}

export function buildTimeline(order: OrderRow, pays: PaymentRow[], ships: ShipmentRow[]): TimelineEntry[] {
  const t: TimelineEntry[] = [{ at: order.placedAt, label: order.source === "admin" ? "สร้างออเดอร์โดยร้าน" : "ลูกค้าสั่งซื้อ", tone: "default" }];
  for (const p of pays) {
    if (p.slipUrl) t.push({ at: p.updatedAt ?? p.createdAt, label: "ลูกค้าแนบสลิป", detail: p.status === "pending_verification" ? "รอตรวจสอบ" : null, tone: "warning" });
    if (p.status === "failed") t.push({ at: p.updatedAt ?? p.createdAt, label: "ปฏิเสธการชำระ", detail: p.failureReason, tone: "destructive" });
    if ((p.status === "refunded" || p.status === "partially_refunded") && p.refundedAmount > 0) t.push({ at: p.updatedAt ?? p.createdAt, label: "คืนเงิน", detail: p.failureReason, tone: "destructive" });
  }
  if (order.paidAt) t.push({ at: order.paidAt, label: "ชำระเงินแล้ว", detail: pays.find((p) => p.status === "paid")?.verifiedBy ? `ตรวจสอบโดย ${pays.find((p) => p.status === "paid")!.verifiedBy === "auto" ? "ระบบอัตโนมัติ" : "เจ้าหน้าที่"}` : null, tone: "success" });
  for (const s of ships) t.push({ at: s.shippedAt ?? s.createdAt, label: "จัดส่งแล้ว", detail: [s.carrier, s.trackingNumber].filter(Boolean).join(" · ") || null, tone: "success" });
  if (order.completedAt) t.push({ at: order.completedAt, label: "เสร็จสิ้น", tone: "success" });
  if (order.cancelledAt) t.push({ at: order.cancelledAt, label: "ยกเลิกออเดอร์", detail: order.cancelReason, tone: "destructive" });
  return t.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function getAdminOrder(tx: Tx, tenantId: string, orderId: string): Promise<AdminOrderDetail | null> {
  const [order] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1);
  if (!order) return null;
  const [items, pays, ships, cust] = await Promise.all([
    tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id))).orderBy(asc(orderItems.createdAt)),
    tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, order.id))).orderBy(desc(payments.createdAt)),
    tx.select().from(shipments).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, order.id))).orderBy(desc(shipments.createdAt)),
    order.customerId
      ? tx
          .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, ordersCount: customers.ordersCount, totalSpent: customers.totalSpent })
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), eq(customers.id, order.customerId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const meta = (order.metadata ?? {}) as { accessKey?: string };
  return { order, items, payments: pays, shipments: ships, customer: cust[0] ?? null, timeline: buildTimeline(order, pays, ships), accessKey: meta.accessKey ?? null };
}

async function lockOrder(tx: Tx, tenantId: string, orderId: string): Promise<OrderRow | null> {
  const [row] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1).for("update");
  return row ?? null;
}

function contactPayload(order: OrderRow) {
  const meta = (order.metadata ?? {}) as { accessKey?: string };
  return { orderId: order.id, number: order.number, customerId: order.customerId, email: order.email, phone: order.phone, customerName: order.customerName, accessKey: meta.accessKey ?? null, total: order.total };
}

// ---------------------------------------------------------------------------
// state transitions
// ---------------------------------------------------------------------------

export async function confirmOrder(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<{ status: string }>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status !== "pending") return fail("ออเดอร์นี้ยืนยันแล้วหรืออยู่ในสถานะที่ยืนยันไม่ได้", "state");
  await tx.update(orders).set({ status: "confirmed" }).where(eq(orders.id, order.id));
  await emitEvent(tx, { tenantId, type: "order.confirmed", payload: { ...contactPayload(order), by: actor.userId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.confirm", targetType: "order", targetId: order.id, diff: { number: order.number } });
  return ok({ status: "confirmed" });
}

export async function shipOrder(tx: Tx, tenantId: string, orderId: string, input: z.output<typeof shipOrderSchema>, actor: Actor): Promise<Result<{ shipmentId: string; trackingUrl: string | null }>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status === "cancelled" || order.status === "refunded") return fail("ออเดอร์ถูกยกเลิกแล้ว จัดส่งไม่ได้", "state");
  if (order.status === "completed") return fail("ออเดอร์เสร็จสิ้นแล้ว", "state");
  const items = await tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  const trackingUrl = input.trackingUrl ?? trackingUrlFor(input.carrier, input.trackingNumber);
  const now = new Date();
  const isPickup = input.carrier === "pickup";
  const [shipment] = await tx
    .insert(shipments)
    .values({
      tenantId,
      orderId: order.id,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      trackingUrl,
      status: "shipped",
      items: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
      shippedAt: now,
    })
    .returning();
  await tx.update(orderItems).set({ fulfilledQuantity: sql`${orderItems.quantity}` }).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  await tx
    .update(orders)
    .set({
      status: "shipped",
      shippedAt: now,
      fulfillmentStatus: isPickup ? "pickup_ready" : "fulfilled",
      internalNote: input.note ? [order.internalNote, `[จัดส่ง] ${input.note}`].filter(Boolean).join("\n") : order.internalNote,
    })
    .where(eq(orders.id, order.id));
  await emitEvent(tx, {
    tenantId,
    type: "order.shipped",
    payload: { ...contactPayload(order), shipmentId: shipment!.id, carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl, by: actor.userId },
  });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.ship", targetType: "order", targetId: order.id, diff: { number: order.number, carrier: input.carrier, trackingNumber: input.trackingNumber } });
  return ok({ shipmentId: shipment!.id, trackingUrl });
}

export async function completeOrder(tx: Tx, tenantId: string, orderId: string, actor: Actor): Promise<Result<{ status: string }>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status === "cancelled" || order.status === "refunded") return fail("ออเดอร์ถูกยกเลิกแล้ว", "state");
  if (order.status === "completed") return ok({ status: "completed" });
  const now = new Date();
  const fulfillment = order.fulfillmentStatus === "pickup_ready" ? "picked_up" : order.fulfillmentStatus === "unfulfilled" ? "fulfilled" : order.fulfillmentStatus;
  await tx.update(orders).set({ status: "completed", completedAt: now, fulfillmentStatus: fulfillment }).where(eq(orders.id, order.id));
  await tx.update(shipments).set({ status: "delivered", deliveredAt: now }).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, order.id), inArray(shipments.status, ["shipped", "in_transit", "pending"])));
  await emitEvent(tx, { tenantId, type: "order.completed", payload: { ...contactPayload(order), by: actor.userId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.complete", targetType: "order", targetId: order.id, diff: { number: order.number } });
  return ok({ status: "completed" });
}

/** Admin cancellation: restocks tracked items, releases the coupon, voids open payments. Paid money is refunded separately. */
export async function cancelOrderAdmin(tx: Tx, tenantId: string, orderId: string, reason: string | null, actor: Actor): Promise<Result<{ restocked: number }>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status === "cancelled" || order.status === "refunded") return fail("ออเดอร์นี้ถูกยกเลิกแล้ว", "state");
  if (order.status === "completed") return fail("ออเดอร์เสร็จสิ้นแล้ว ยกเลิกไม่ได้ (ใช้การคืนเงินแทน)", "state");

  const items = await tx.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)));
  const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];
  const prods = productIds.length ? await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))) : [];
  const pById = new Map(prods.map((p) => [p.id, p]));
  let restocked = 0;
  for (const it of items) {
    if (!it.productId) continue;
    const p = pById.get(it.productId);
    if (!p || !p.trackInventory || it.type === "service") continue;
    if (it.variantId) await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${it.quantity}` }).where(eq(productVariants.id, it.variantId));
    else await tx.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.productId));
    await tx.insert(inventoryMovements).values({ tenantId, productId: it.productId, variantId: it.variantId, delta: it.quantity, reason: "release", refType: "order", refId: order.id, note: reason ? `ร้านยกเลิกออเดอร์: ${reason}` : "ร้านยกเลิกออเดอร์", createdBy: actor.userId });
    restocked += it.quantity;
  }
  if (order.couponCode) {
    await tx.update(discounts).set({ usedCount: sql`greatest(${discounts.usedCount} - 1, 0)` }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.code, order.couponCode)));
  }
  await tx
    .update(payments)
    .set({ status: "cancelled" })
    .where(and(eq(payments.tenantId, tenantId), eq(payments.refType, "order"), eq(payments.refId, order.id), inArray(payments.status, ["pending", "pending_verification"])));
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason?.trim() || "ร้านยกเลิก" }).where(eq(orders.id, order.id));
  await emitEvent(tx, { tenantId, type: "order.cancelled", payload: { ...contactPayload(order), by: "admin", reason, actorId: actor.userId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.cancel", targetType: "order", targetId: order.id, diff: { number: order.number, reason, restocked, total: order.total } });
  return ok({ restocked });
}

export async function updateInternalNote(tx: Tx, tenantId: string, orderId: string, note: string | null): Promise<boolean> {
  const r = await tx
    .update(orders)
    .set({ internalNote: note?.trim() || null })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
    .returning({ id: orders.id });
  return r.length > 0;
}

// ---------------------------------------------------------------------------
// payments on an order
// ---------------------------------------------------------------------------

/** Verifies a pending payment (slip / promptpay / transfer) → markPaid → module handler marks the order paid. */
export async function verifyPayment(tx: Tx, tenantId: string, paymentId: string, actor: Actor): Promise<Result<PaymentRow>> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).limit(1).for("update");
  if (!p) return fail("ไม่พบรายการชำระเงิน", "not_found");
  if (p.status === "paid") return ok(p);
  if (!["pending", "pending_verification", "failed", "expired"].includes(p.status)) return fail("รายการนี้อยู่ในสถานะที่ยืนยันไม่ได้", "state");
  const updated = await markPaid(tx, tenantId, paymentId, { verifiedBy: actor.userId });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "payment.verify", targetType: "payment", targetId: paymentId, diff: { refType: p.refType, refId: p.refId, amount: p.amount, method: p.method } });
  return ok(updated);
}

export async function rejectPayment(tx: Tx, tenantId: string, paymentId: string, reason: string, actor: Actor): Promise<Result<PaymentRow>> {
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId))).limit(1).for("update");
  if (!p) return fail("ไม่พบรายการชำระเงิน", "not_found");
  if (p.status === "paid") return fail("รายการนี้ชำระแล้ว ปฏิเสธไม่ได้ (ใช้การคืนเงินแทน)", "state");
  if (p.status === "failed") return ok(p);
  const updated = await markFailed(tx, tenantId, paymentId, reason.trim() || "สลิปไม่ถูกต้อง");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "payment.reject", targetType: "payment", targetId: paymentId, diff: { refType: p.refType, refId: p.refId, amount: p.amount, reason } });
  return ok(updated);
}

export async function refundOrderPayment(tx: Tx, tenantId: string, orderId: string, paymentId: string, amount: number, note: string | null, actor: Actor): Promise<Result<{ refunded: number; paymentStatus: string }>> {
  const order = await lockOrder(tx, tenantId, orderId);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.refType, "order"), eq(payments.refId, orderId))).limit(1).for("update");
  if (!p) return fail("ไม่พบรายการชำระเงินของออเดอร์นี้", "not_found");
  if (!["paid", "partially_refunded"].includes(p.status)) return fail("คืนเงินได้เฉพาะรายการที่ชำระแล้ว", "state");
  const remaining = p.amount - p.refundedAmount;
  if (amount > remaining) return fail(`คืนได้สูงสุด ${(remaining / 100).toLocaleString("th-TH")} บาท`, "amount");
  const updated = await refundPayment(tx, tenantId, paymentId, amount, note ?? undefined);
  const full = updated.status === "refunded";
  await tx
    .update(orders)
    .set({ paymentStatus: full ? "refunded" : "partially_refunded", status: full && order.status !== "completed" ? "refunded" : order.status })
    .where(eq(orders.id, order.id));
  await emitEvent(tx, { tenantId, type: "order.refunded", payload: { ...contactPayload(order), paymentId, amount, full, note } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.refund", targetType: "order", targetId: order.id, diff: { number: order.number, paymentId, amount, note } });
  return ok({ refunded: updated.refundedAmount, paymentStatus: updated.status });
}

// ---------------------------------------------------------------------------
// manual order (POS / phone / LINE)
// ---------------------------------------------------------------------------

const PROVIDER_FOR: Record<"cash" | "slip" | "promptpay_qr" | "cod", PaymentProvider> = { cash: "cash", slip: "bank_transfer", promptpay_qr: "promptpay", cod: "cod" };

export interface AdminCreateOrderResult {
  orderId: string;
  number: string;
  paymentId: string;
  total: number;
}

export async function adminCreateOrder(tx: Tx, tenantId: string, input: z.output<typeof manualOrderSchema>, settings: Record<string, unknown>, actor: Actor): Promise<Result<AdminCreateOrderResult>> {
  // merge duplicate lines
  const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const it of input.items) {
    const k = `${it.productId}:${it.variantId ?? ""}`;
    const cur = merged.get(k);
    if (cur) cur.quantity += it.quantity;
    else merged.set(k, { ...it });
  }
  const lines = [...merged.values()];
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);
  const lockedProducts = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))).for("update");
  const lockedVariants = variantIds.length ? await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, variantIds))).for("update") : [];
  const pById = new Map(lockedProducts.map((p) => [p.id, p]));
  const vById = new Map(lockedVariants.map((v) => [v.id, v]));

  type Line = { productId: string; variantId: string | null; name: string; variantTitle: string | null; sku: string | null; image: string | null; quantity: number; unitPrice: number; total: number; type: string; weight: number; tracked: boolean };
  const built: Line[] = [];
  for (const l of lines) {
    const p = pById.get(l.productId);
    if (!p || p.status === "archived") return fail("มีสินค้าที่ไม่พร้อมจำหน่ายในรายการ", "unavailable");
    const v = l.variantId ? vById.get(l.variantId) : null;
    if (l.variantId && (!v || v.productId !== p.id)) return fail(`ไม่พบตัวเลือกสินค้าของ ${p.name}`, "unavailable");
    if (p.hasVariants && !v) return fail(`กรุณาเลือกตัวเลือกของ ${p.name}`, "variant_required");
    const tracked = p.trackInventory && p.type !== "service";
    const have = v ? v.stock : p.stock;
    if (tracked && have < l.quantity) {
      const label = v ? `${p.name} (${v.title})` : p.name;
      return fail(have <= 0 ? `${label} สินค้าหมด` : `${label} เหลือเพียง ${have} ชิ้น`, "out_of_stock");
    }
    const unitPrice = v ? v.price : p.price;
    built.push({
      productId: p.id,
      variantId: v?.id ?? null,
      name: p.name,
      variantTitle: v?.title ?? null,
      sku: v?.sku ?? p.sku ?? null,
      image: v?.image ?? p.images?.[0]?.url ?? null,
      quantity: l.quantity,
      unitPrice,
      total: unitPrice * l.quantity,
      type: p.type,
      weight: (v?.weightGrams ?? p.weightGrams ?? 0) * l.quantity,
      tracked,
    });
  }

  const subtotal = built.reduce((s, l) => s + l.total, 0);
  const discountTotal = Math.min(subtotal, Math.max(0, input.discount));
  const weightGrams = built.reduce((s, l) => s + l.weight, 0);

  // shipping
  let shippingName = "จัดส่งเอง";
  let shippingType = "manual";
  let shippingBase = input.shippingFee ?? 0;
  let codFee = 0;
  let isPickup = false;
  let shippingMethodId: string | null = null;
  if (input.shippingMethodId) {
    const method = await getShippingMethod(tx, tenantId, input.shippingMethodId);
    if (!method) return fail("ไม่พบวิธีจัดส่งที่เลือก", "shipping");
    const quote = toQuote(method, { subtotal: subtotal - discountTotal, weightGrams });
    if (!quote) return fail("วิธีจัดส่งนี้ไม่รองรับน้ำหนักพัสดุของออเดอร์", "shipping_unavailable");
    shippingName = method.name;
    shippingType = method.type;
    shippingBase = input.shippingFee ?? quote.amount;
    codFee = input.paymentMethod === "cod" ? quote.codFee : 0;
    isPickup = quote.isPickup;
    shippingMethodId = method.id;
  }
  if (!isPickup && !input.address && shippingType !== "manual") return fail("กรุณากรอกที่อยู่จัดส่ง", "address");
  const shippingTotal = Math.max(0, shippingBase) + codFee;
  const total = subtotal - discountTotal + shippingTotal;

  const phone = normalizeThaiPhone(input.contact.phone) ?? input.contact.phone;
  const email = input.contact.email?.trim().toLowerCase() || null;
  const guest = await upsertGuestCustomer(tx, tenantId, { phone, email, name: input.contact.name });
  const customerId = guest?.id ?? null;

  const seq = await nextCounter(tx, tenantId, "order", 1000);
  const number = formatOrderNumber(seq);
  const accessKey = randomToken(16);
  const address: AddressJson | null = input.address ? { ...input.address, country: "TH" } : isPickup ? { name: input.contact.name, phone, line1: shippingName, country: "TH" } : null;
  const [order] = await tx
    .insert(orders)
    .values({
      tenantId,
      number,
      customerId,
      email,
      phone,
      customerName: input.contact.name,
      status: input.markPaid || input.paymentMethod === "cod" || input.paymentMethod === "cash" ? "confirmed" : "pending",
      paymentStatus: "unpaid",
      fulfillmentStatus: "unfulfilled",
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal: 0,
      total,
      shippingMethodName: shippingName,
      shippingMethodType: shippingType,
      shippingAddress: address,
      customerNote: input.customerNote,
      internalNote: input.internalNote,
      source: "admin",
      metadata: { accessKey, paymentMethod: input.paymentMethod, codFee, shippingBase, shippingMethodId, createdBy: actor.userId, manualDiscount: discountTotal },
      placedAt: new Date(),
    })
    .returning();
  const orderId = order!.id;

  await tx.insert(orderItems).values(
    built.map((l) => ({
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
      total: l.total,
      type: l.type,
    })),
  );
  for (const l of built) {
    if (!l.tracked) continue;
    if (l.variantId) await tx.update(productVariants).set({ stock: sql`${productVariants.stock} - ${l.quantity}` }).where(eq(productVariants.id, l.variantId));
    else await tx.update(products).set({ stock: sql`${products.stock} - ${l.quantity}` }).where(eq(products.id, l.productId));
    await tx.insert(inventoryMovements).values({ tenantId, productId: l.productId, variantId: l.variantId, delta: -l.quantity, reason: "sale", refType: "order", refId: orderId, note: "ออเดอร์สร้างโดยร้าน", createdBy: actor.userId });
  }

  await emitEvent(tx, { tenantId, type: "order.created", payload: { orderId, number, total, customerId, email, phone, accessKey, paymentMethod: input.paymentMethod, source: "admin" } });

  const ps = paymentSettings(settings);
  const needsExpiry = input.paymentMethod === "promptpay_qr" || input.paymentMethod === "slip";
  const payment = await createPayment(tx, tenantId, {
    refType: "order",
    refId: orderId,
    amount: total,
    provider: PROVIDER_FOR[input.paymentMethod],
    method: input.paymentMethod as PaymentMethod,
    customerId,
    promptpayId: resolvePromptpayId(settings) ?? undefined,
    expiresMinutes: needsExpiry && !input.markPaid ? (ps.expiresMinutes ?? 1440) : undefined,
    metadata: { orderNumber: number, source: "admin" },
  });
  await tx
    .update(orders)
    .set({ metadata: { ...(order!.metadata ?? {}), paymentId: payment.id } })
    .where(eq(orders.id, orderId));
  if (input.markPaid) await markPaid(tx, tenantId, payment.id, { verifiedBy: actor.userId });

  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "order.create_manual", targetType: "order", targetId: orderId, diff: { number, total, paymentMethod: input.paymentMethod, markPaid: input.markPaid, items: built.length } });
  return ok({ orderId, number, paymentId: payment.id, total });
}

/** Products + variants + shipping methods for the manual order form (active only). */
export async function manualOrderCatalog(tx: Tx, tenantId: string) {
  const [prods, variants] = await Promise.all([
    tx
      .select({ id: products.id, name: products.name, price: products.price, images: products.images, hasVariants: products.hasVariants, trackInventory: products.trackInventory, stock: products.stock, type: products.type, sku: products.sku })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.status, ["active", "draft"])))
      .orderBy(asc(products.name))
      .limit(500),
    tx
      .select({ id: productVariants.id, productId: productVariants.productId, title: productVariants.title, price: productVariants.price, stock: productVariants.stock, sku: productVariants.sku })
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.active, true)))
      .orderBy(asc(productVariants.position)),
  ]);
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    const arr = byProduct.get(v.productId) ?? [];
    arr.push(v);
    byProduct.set(v.productId, arr);
  }
  return prods.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: p.images?.[0]?.url ?? null,
    hasVariants: p.hasVariants,
    stock: p.trackInventory && p.type !== "service" ? p.stock : null,
    sku: p.sku,
    variants: (byProduct.get(p.id) ?? []).map((v) => ({ id: v.id, title: v.title, price: v.price, stock: p.trackInventory && p.type !== "service" ? v.stock : null, sku: v.sku })),
  }));
}
