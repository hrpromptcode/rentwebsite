import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nextCounter, payments, restaurantOrderItems, restaurantOrders, tableSessions, type Tx } from "@rentweb/db";
import { emitEvent, fail, normalizeThaiPhone, ok, type Result } from "@rentweb/core";
import { createPayment, type PaymentMethod, type PaymentProvider } from "@rentweb/core/payments";
import { upsertGuestCustomer } from "@rentweb/core/customer";
import { priceCart, type CartItem, type PricedCart } from "./cart";
import { getSession, isSessionOpen } from "./tables";

export type RestaurantOrder = typeof restaurantOrders.$inferSelect;
export type RestaurantOrderItem = typeof restaurantOrderItems.$inferSelect;
export type OrderType = "dine_in" | "pickup";
export type OrderPaymentMethod = "promptpay_qr" | "slip" | "cash" | "counter";

export const ORDER_STATUSES = ["received", "preparing", "ready", "served", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions (kitchen / staff flow). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "completed", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

export interface CreateOrderInput {
  type: OrderType;
  items: CartItem[];
  sessionId?: string | null;
  tableId?: string | null;
  note?: string | null;
  /** name typed at the table so staff can serve the right person */
  guestLabel?: string | null;
  contact?: { name?: string | null; phone?: string | null } | null;
  customerId?: string | null;
  scheduledFor?: Date | null;
  paymentMethod?: OrderPaymentMethod | null;
  promptpayId?: string | null;
  serviceChargePercent?: number;
  deliveryFee?: number;
}

export interface CreatedOrder {
  order: RestaurantOrder;
  items: RestaurantOrderItem[];
  pricing: PricedCart;
  payment: typeof payments.$inferSelect | null;
}

function providerFor(method: PaymentMethod): PaymentProvider {
  return method === "promptpay_qr" ? "promptpay" : method === "slip" ? "bank_transfer" : method === "cash" ? "cash" : "bank_transfer";
}

/**
 * Creates a dine-in or pickup order from a priced cart. Prices and modifiers are snapshotted on the order items.
 *  - dine-in: attached to an open table session, paid later at the bill (pay_at_counter) unless a method is given
 *  - pickup : contact required; PromptPay / slip creates a payment row, cash is paid at pickup
 */
export async function createOrder(tx: Tx, tenantId: string, input: CreateOrderInput): Promise<Result<CreatedOrder>> {
  const priced = await priceCart(tx, tenantId, input.items, { serviceChargePercent: input.serviceChargePercent, deliveryFee: input.deliveryFee });
  if (!priced.ok) return priced;
  const pricing = priced.value;

  let tableId = input.tableId ?? null;
  const sessionId = input.sessionId ?? null;
  if (input.type === "dine_in") {
    if (!sessionId) return fail("ไม่พบรอบการใช้โต๊ะ กรุณาสแกน QR ที่โต๊ะอีกครั้ง", "no_session");
    const session = await getSession(tx, tenantId, sessionId);
    if (!session || !isSessionOpen(session)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว กรุณาสแกน QR ที่โต๊ะอีกครั้ง", "session_closed");
    tableId = session.tableId;
  }

  let customerId = input.customerId ?? null;
  const customerName = input.contact?.name?.trim() || null;
  let customerPhone: string | null = null;
  if (input.contact?.phone) {
    customerPhone = normalizeThaiPhone(input.contact.phone);
    if (!customerPhone) return fail("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "invalid_phone");
  }
  if (input.type === "pickup") {
    if (!customerPhone) return fail("กรุณากรอกเบอร์โทรศัพท์สำหรับติดตามออเดอร์", "phone_required");
    if (!customerName) return fail("กรุณากรอกชื่อผู้รับ", "name_required");
    if (!customerId) {
      const c = await upsertGuestCustomer(tx, tenantId, { phone: customerPhone, name: customerName });
      customerId = c?.id ?? null;
    }
  }

  const method = input.paymentMethod ?? (input.type === "dine_in" ? "counter" : "cash");
  const paysNow = method === "promptpay_qr" || method === "slip";
  if (method === "promptpay_qr" && !input.promptpayId) return fail("ร้านยังไม่ได้ตั้งค่า PromptPay", "no_promptpay");

  const number = `R-${await nextCounter(tx, tenantId, "rest_order", 1000)}`;
  const [order] = await tx
    .insert(restaurantOrders)
    .values({
      tenantId,
      number,
      type: input.type,
      tableId,
      sessionId,
      customerId,
      customerName,
      customerPhone,
      guestLabel: input.guestLabel?.trim() || null,
      status: "received",
      subtotal: pricing.subtotal,
      serviceCharge: pricing.serviceCharge,
      deliveryFee: pricing.deliveryFee,
      total: pricing.total,
      paymentStatus: paysNow ? "unpaid" : "pay_at_counter",
      scheduledFor: input.scheduledFor ?? null,
      note: input.note?.trim() || null,
    })
    .returning();

  const items = await tx
    .insert(restaurantOrderItems)
    .values(
      pricing.lines.map((l) => ({
        tenantId,
        orderId: order!.id,
        menuItemId: l.menuItemId,
        name: l.name,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        modifiers: l.modifiers.map((m) => ({ group: m.group, name: m.name, priceDelta: m.priceDelta })),
        total: l.lineTotal,
        note: l.note,
        station: l.station,
        status: "queued",
      })),
    )
    .returning();

  let payment: typeof payments.$inferSelect | null = null;
  if (paysNow) {
    payment = await createPayment(tx, tenantId, {
      refType: "rest_order",
      refId: order!.id,
      amount: pricing.total,
      provider: providerFor(method),
      method,
      customerId,
      promptpayId: input.promptpayId ?? undefined,
      expiresMinutes: 30,
      metadata: { kind: "order", orderId: order!.id, number },
    });
    await tx.update(restaurantOrders).set({ paymentId: payment.id }).where(eq(restaurantOrders.id, order!.id));
    order!.paymentId = payment.id;
  }

  if (sessionId) {
    await tx
      .update(tableSessions)
      .set({ total: sql`${tableSessions.total} + ${pricing.total}` })
      .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId)));
  }

  await emitEvent(tx, {
    tenantId,
    type: "rest_order.created",
    payload: { orderId: order!.id, number, type: input.type, total: pricing.total, tableId, sessionId, paymentStatus: order!.paymentStatus, stations: [...new Set(pricing.lines.map((l) => l.station))] },
  });
  return ok({ order: order!, items, pricing, payment });
}

/**
 * Payment handler for refType "rest_order". Idempotent: a payment either targets one order
 * (metadata.kind = "order") or a whole table session (metadata.kind = "session", refId = session id).
 */
export async function onRestaurantOrderPaid(tx: Tx, payment: typeof payments.$inferSelect): Promise<void> {
  const tenantId = payment.tenantId;
  const meta = (payment.providerPayload ?? {}) as { kind?: string };
  const [order] = meta.kind === "session" ? [] : await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, payment.refId))).limit(1);

  if (order) {
    if (order.paymentStatus === "paid") return;
    await tx.update(restaurantOrders).set({ paymentStatus: "paid", paymentId: payment.id }).where(eq(restaurantOrders.id, order.id));
    await emitEvent(tx, { tenantId, type: "rest_order.paid", payload: { orderId: order.id, number: order.number, amount: payment.amount, paymentId: payment.id } });
    return;
  }

  const [session] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, payment.refId))).limit(1);
  if (!session) return;
  if (session.status === "paid" || session.status === "closed") return;
  await tx
    .update(restaurantOrders)
    .set({ paymentStatus: "paid" })
    .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.sessionId, session.id), inArray(restaurantOrders.paymentStatus, ["unpaid", "pay_at_counter"])));
  await tx.update(tableSessions).set({ status: "paid", paymentId: payment.id }).where(eq(tableSessions.id, session.id));
  await emitEvent(tx, { tenantId, type: "table.paid", payload: { sessionId: session.id, tableId: session.tableId, amount: payment.amount, paymentId: payment.id } });
}

const ITEM_STATUS_FOR: Partial<Record<OrderStatus, string>> = { preparing: "cooking", ready: "done", served: "served", completed: "served", cancelled: "cancelled" };

/** Kitchen / staff moves an order along received -> preparing -> ready -> served/completed. */
export async function updateOrderStatus(tx: Tx, tenantId: string, orderId: string, next: OrderStatus): Promise<Result<RestaurantOrder>> {
  const [order] = await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, orderId))).limit(1);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  const from = order.status as OrderStatus;
  if (from === next) return ok(order);
  if (!ORDER_TRANSITIONS[from]?.includes(next)) return fail(`ไม่สามารถเปลี่ยนสถานะจาก ${from} เป็น ${next}`, "invalid_transition");
  const now = new Date();
  const patch: Partial<typeof restaurantOrders.$inferInsert> = { status: next };
  if (next === "ready") patch.readyAt = now;
  if (next === "completed") patch.completedAt = now;
  if (next === "cancelled") patch.cancelledAt = now;
  const [updated] = await tx.update(restaurantOrders).set(patch).where(eq(restaurantOrders.id, orderId)).returning();
  const itemStatus = ITEM_STATUS_FOR[next];
  if (itemStatus) await tx.update(restaurantOrderItems).set({ status: itemStatus }).where(and(eq(restaurantOrderItems.tenantId, tenantId), eq(restaurantOrderItems.orderId, orderId)));
  await emitEvent(tx, { tenantId, type: "rest_order.status_changed", payload: { orderId, number: order.number, from, to: next, type: order.type, tableId: order.tableId, customerPhone: order.customerPhone } });
  return ok(updated!);
}

export interface OrderWithItems {
  order: RestaurantOrder;
  items: RestaurantOrderItem[];
  payment: typeof payments.$inferSelect | null;
}

export async function getOrderById(tx: Tx, tenantId: string, orderId: string): Promise<OrderWithItems | null> {
  const [order] = await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, orderId))).limit(1);
  if (!order) return null;
  return hydrate(tx, tenantId, order);
}

export async function getOrderByNumber(tx: Tx, tenantId: string, number: string): Promise<OrderWithItems | null> {
  const [order] = await tx
    .select()
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.number, number.trim().toUpperCase())))
    .limit(1);
  if (!order) return null;
  return hydrate(tx, tenantId, order);
}

async function hydrate(tx: Tx, tenantId: string, order: RestaurantOrder): Promise<OrderWithItems> {
  const items = await tx.select().from(restaurantOrderItems).where(and(eq(restaurantOrderItems.tenantId, tenantId), eq(restaurantOrderItems.orderId, order.id))).orderBy(asc(restaurantOrderItems.createdAt));
  let payment: typeof payments.$inferSelect | null = null;
  if (order.paymentId) {
    const [p] = await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, order.paymentId))).limit(1);
    payment = p ?? null;
  }
  return { order, items, payment };
}

/**
 * Customer-facing lookup: a pickup order is viewable with its number + the phone it was placed with;
 * a dine-in order with the table session token (cookie). Fails when the proof does not match.
 */
export async function getOrderForCustomer(tx: Tx, tenantId: string, number: string, proof: { phone?: string | null; sessionToken?: string | null }): Promise<Result<OrderWithItems>> {
  const found = await getOrderByNumber(tx, tenantId, number);
  if (!found) return fail("ไม่พบออเดอร์", "not_found");
  const { order } = found;
  if (order.type === "dine_in") {
    if (!order.sessionId || !proof.sessionToken) return fail("ต้องเปิดจากโต๊ะที่สั่ง", "forbidden");
    const session = await getSession(tx, tenantId, order.sessionId);
    if (!session || session.token !== proof.sessionToken.toUpperCase()) return fail("ต้องเปิดจากโต๊ะที่สั่ง", "forbidden");
    return ok(found);
  }
  const phone = proof.phone ? normalizeThaiPhone(proof.phone) : null;
  if (!phone || phone !== order.customerPhone) return fail("เบอร์โทรศัพท์ไม่ตรงกับออเดอร์", "forbidden");
  return ok(found);
}

export interface KitchenQueueItem {
  itemId: string;
  orderId: string;
  number: string;
  orderType: string;
  tableId: string | null;
  name: string;
  quantity: number;
  modifiers: Array<{ group: string; name: string; priceDelta: number }>;
  note: string | null;
  status: string;
  placedAt: Date;
  scheduledFor: Date | null;
}

/** station -> item status -> items */
export type KitchenQueue = Record<string, Record<string, KitchenQueueItem[]>>;

/** Active order items grouped by station then status, oldest first (for the KDS). */
export async function kitchenQueue(tx: Tx, tenantId: string): Promise<KitchenQueue> {
  const orders = await tx
    .select()
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), inArray(restaurantOrders.status, ["received", "preparing", "ready"])))
    .orderBy(asc(restaurantOrders.placedAt));
  if (!orders.length) return {};
  const items = await tx
    .select()
    .from(restaurantOrderItems)
    .where(and(eq(restaurantOrderItems.tenantId, tenantId), inArray(restaurantOrderItems.orderId, orders.map((o) => o.id))))
    .orderBy(asc(restaurantOrderItems.createdAt));
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const out: KitchenQueue = {};
  for (const it of items) {
    if (it.status === "cancelled" || it.status === "served") continue;
    const o = byOrder.get(it.orderId)!;
    const station = (out[it.station] ??= {});
    (station[it.status] ??= []).push({
      itemId: it.id,
      orderId: o.id,
      number: o.number,
      orderType: o.type,
      tableId: o.tableId,
      name: it.name,
      quantity: it.quantity,
      modifiers: it.modifiers ?? [],
      note: it.note,
      status: it.status,
      placedAt: o.placedAt,
      scheduledFor: o.scheduledFor,
    });
  }
  return out;
}

/** Recent orders for a phone (order history for guests). */
export async function listOrdersByPhone(tx: Tx, tenantId: string, phone: string, limit = 20): Promise<RestaurantOrder[]> {
  const p = normalizeThaiPhone(phone);
  if (!p) return [];
  return tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.customerPhone, p))).orderBy(desc(restaurantOrders.placedAt)).limit(limit);
}
