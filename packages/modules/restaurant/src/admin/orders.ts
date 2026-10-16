import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { diningTables, payments, restaurantOrderItems, restaurantOrders, tableSessions, type Tx } from "@rentweb/db";
import { emitEvent, fail, ok, type Result } from "@rentweb/core";
import { createPayment, getPayment, markFailed, markPaid } from "@rentweb/core/payments";
import { updateOrderStatus, type OrderStatus, type RestaurantOrder } from "../services/orders";
import { closeSession, sessionSummary } from "../services/tables";

/* ────────────── JSON-safe view models (shared by server pages, route handlers and client boards) ────────────── */

export interface AdminPaymentInfo {
  id: string;
  status: string;
  method: string;
  provider: string;
  amount: number;
  slipUrl: string | null;
  paidAt: string | null;
  expiresAt: string | null;
}

export interface BoardItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  modifiers: Array<{ group: string; name: string; priceDelta: number }>;
  note: string | null;
  station: string;
  status: string;
}

export interface BoardOrder {
  id: string;
  number: string;
  type: string;
  status: string;
  paymentStatus: string;
  paymentId: string | null;
  tableId: string | null;
  tableName: string | null;
  zone: string | null;
  sessionId: string | null;
  guestLabel: string | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  subtotal: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  placedAt: string;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  scheduledFor: string | null;
  items: BoardItem[];
  payment: AdminPaymentInfo | null;
}

export interface OpenSession {
  id: string;
  tableId: string;
  tableName: string;
  zone: string | null;
  status: string;
  token: string;
  openedAt: string;
  ordersCount: number;
  total: number;
  paidTotal: number;
  dueTotal: number;
  payment: AdminPaymentInfo | null;
}

export interface BoardSnapshot {
  orders: BoardOrder[];
  sessions: OpenSession[];
  now: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPaymentInfo(p: typeof payments.$inferSelect | null | undefined): AdminPaymentInfo | null {
  if (!p) return null;
  return { id: p.id, status: p.status, method: p.method, provider: p.provider, amount: p.amount, slipUrl: p.slipUrl ?? null, paidAt: iso(p.paidAt), expiresAt: iso(p.expiresAt) };
}

/** Loads orders (+ table, items, payment) for a where clause. Oldest first unless `newestFirst`. */
export async function loadOrders(tx: Tx, tenantId: string, where: SQL | undefined, opts: { newestFirst?: boolean; limit?: number; offset?: number } = {}): Promise<BoardOrder[]> {
  let q = tx
    .select({ o: restaurantOrders, tableName: diningTables.name, zone: diningTables.zone })
    .from(restaurantOrders)
    .leftJoin(diningTables, eq(diningTables.id, restaurantOrders.tableId))
    .where(and(eq(restaurantOrders.tenantId, tenantId), where))
    .orderBy(opts.newestFirst ? desc(restaurantOrders.placedAt) : asc(restaurantOrders.placedAt))
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  const rows = await q;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.o.id);
  const items = await tx
    .select()
    .from(restaurantOrderItems)
    .where(and(eq(restaurantOrderItems.tenantId, tenantId), inArray(restaurantOrderItems.orderId, ids)))
    .orderBy(asc(restaurantOrderItems.createdAt));
  const paymentIds = rows.map((r) => r.o.paymentId).filter((x): x is string => !!x);
  const pays = paymentIds.length ? await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), inArray(payments.id, paymentIds))) : [];
  const payById = new Map(pays.map((p) => [p.id, p]));
  return rows.map(({ o, tableName, zone }) => ({
    id: o.id,
    number: o.number,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentId: o.paymentId,
    tableId: o.tableId,
    tableName: tableName ?? null,
    zone: zone ?? null,
    sessionId: o.sessionId,
    guestLabel: o.guestLabel,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    note: o.note,
    subtotal: o.subtotal,
    serviceCharge: o.serviceCharge,
    deliveryFee: o.deliveryFee,
    total: o.total,
    placedAt: o.placedAt.toISOString(),
    readyAt: iso(o.readyAt),
    completedAt: iso(o.completedAt),
    cancelledAt: iso(o.cancelledAt),
    scheduledFor: iso(o.scheduledFor),
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, modifiers: i.modifiers ?? [], note: i.note, station: i.station, status: i.status })),
    payment: toPaymentInfo(o.paymentId ? payById.get(o.paymentId) : null),
  }));
}

/** Active orders for the live board: everything not finished + orders finished in the last 45 minutes. */
export async function listBoardOrders(tx: Tx, tenantId: string, now = new Date()): Promise<BoardOrder[]> {
  const since = new Date(now.getTime() - 45 * 60_000);
  return loadOrders(
    tx,
    tenantId,
    or(
      inArray(restaurantOrders.status, ["received", "preparing", "ready", "served"]),
      and(eq(restaurantOrders.status, "completed"), gte(restaurantOrders.completedAt, since)),
      and(eq(restaurantOrders.status, "cancelled"), gte(restaurantOrders.cancelledAt, since)),
    ),
  );
}

/** Open table sessions (open / bill_requested) with running totals. */
export async function listOpenSessions(tx: Tx, tenantId: string): Promise<OpenSession[]> {
  const rows = await tx
    .select({ s: tableSessions, tableName: diningTables.name, zone: diningTables.zone })
    .from(tableSessions)
    .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
    .where(and(eq(tableSessions.tenantId, tenantId), inArray(tableSessions.status, ["open", "bill_requested"])))
    .orderBy(asc(tableSessions.openedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.id);
  const orders = await tx
    .select({ sessionId: restaurantOrders.sessionId, total: restaurantOrders.total, paymentStatus: restaurantOrders.paymentStatus, status: restaurantOrders.status })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), inArray(restaurantOrders.sessionId, ids)));
  const paymentIds = rows.map((r) => r.s.paymentId).filter((x): x is string => !!x);
  const pays = paymentIds.length ? await tx.select().from(payments).where(and(eq(payments.tenantId, tenantId), inArray(payments.id, paymentIds))) : [];
  const payById = new Map(pays.map((p) => [p.id, p]));
  return rows.map(({ s, tableName, zone }) => {
    const live = orders.filter((o) => o.sessionId === s.id && o.status !== "cancelled");
    const total = live.reduce((a, o) => a + o.total, 0);
    const paidTotal = live.filter((o) => o.paymentStatus === "paid").reduce((a, o) => a + o.total, 0);
    return {
      id: s.id,
      tableId: s.tableId,
      tableName,
      zone,
      status: s.status,
      token: s.token,
      openedAt: s.openedAt.toISOString(),
      ordersCount: live.length,
      total,
      paidTotal,
      dueTotal: Math.max(0, total - paidTotal),
      payment: toPaymentInfo(s.paymentId ? payById.get(s.paymentId) : null),
    };
  });
}

export async function boardSnapshot(tx: Tx, tenantId: string): Promise<BoardSnapshot> {
  const now = new Date();
  const orders = await listBoardOrders(tx, tenantId, now);
  const sessions = await listOpenSessions(tx, tenantId);
  return { orders, sessions, now: now.toISOString() };
}

export interface HistoryFilter {
  from: Date;
  to: Date;
  q?: string | null;
  status?: string | null;
  type?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listOrderHistory(tx: Tx, tenantId: string, f: HistoryFilter): Promise<{ rows: BoardOrder[]; total: number; page: number; pages: number }> {
  const pageSize = f.pageSize ?? 25;
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [gte(restaurantOrders.placedAt, f.from), lte(restaurantOrders.placedAt, f.to)];
  if (f.status) conds.push(eq(restaurantOrders.status, f.status));
  if (f.type) conds.push(eq(restaurantOrders.type, f.type));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(or(ilike(restaurantOrders.number, like), ilike(restaurantOrders.customerName, like), ilike(restaurantOrders.customerPhone, like), ilike(restaurantOrders.guestLabel, like))!);
  }
  const where = and(...conds)!;
  const [c] = await tx.select({ c: count() }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), where));
  const total = Number(c?.c ?? 0);
  const rows = await loadOrders(tx, tenantId, where, { newestFirst: true, limit: pageSize, offset: (page - 1) * pageSize });
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Sales summary for a period. */
export async function salesSummary(tx: Tx, tenantId: string, from: Date, to: Date): Promise<{ orders: number; paid: number; revenue: number; cancelled: number }> {
  const [row] = await tx
    .select({
      orders: count(),
      paid: sql<number>`coalesce(sum(case when ${restaurantOrders.paymentStatus} = 'paid' then 1 else 0 end), 0)`,
      revenue: sql<number>`coalesce(sum(case when ${restaurantOrders.paymentStatus} = 'paid' and ${restaurantOrders.status} <> 'cancelled' then ${restaurantOrders.total} else 0 end), 0)`,
      cancelled: sql<number>`coalesce(sum(case when ${restaurantOrders.status} = 'cancelled' then 1 else 0 end), 0)`,
    })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), gte(restaurantOrders.placedAt, from), lte(restaurantOrders.placedAt, to)));
  return { orders: Number(row?.orders ?? 0), paid: Number(row?.paid ?? 0), revenue: Number(row?.revenue ?? 0), cancelled: Number(row?.cancelled ?? 0) };
}

/* ────────────── mutations ────────────── */

/** Staff moves an order forward; pickup orders that become ready emit `rest_order.ready` (customer notification). */
export async function advanceOrder(tx: Tx, tenantId: string, orderId: string, next: OrderStatus): Promise<Result<RestaurantOrder>> {
  const r = await updateOrderStatus(tx, tenantId, orderId, next);
  if (!r.ok) return r;
  if (next === "ready" && r.value.type === "pickup") {
    await emitEvent(tx, {
      tenantId,
      type: "rest_order.ready",
      payload: { orderId: r.value.id, number: r.value.number, customerPhone: r.value.customerPhone, customerName: r.value.customerName, scheduledFor: r.value.scheduledFor?.toISOString() ?? null },
    });
  }
  return r;
}

export async function cancelOrder(tx: Tx, tenantId: string, orderId: string, reason?: string | null): Promise<Result<RestaurantOrder>> {
  const r = await updateOrderStatus(tx, tenantId, orderId, "cancelled");
  if (!r.ok) return r;
  const order = r.value;
  if (order.sessionId) {
    await tx
      .update(tableSessions)
      .set({ total: sql`greatest(0, ${tableSessions.total} - ${order.total})` })
      .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, order.sessionId)));
  }
  if (order.paymentId) {
    const p = await getPayment(tx, tenantId, order.paymentId);
    if (p && (p.status === "pending" || p.status === "pending_verification")) await markFailed(tx, tenantId, p.id, reason ? `ยกเลิกออเดอร์: ${reason}` : "ยกเลิกออเดอร์");
  }
  await emitEvent(tx, { tenantId, type: "rest_order.cancelled", payload: { orderId: order.id, number: order.number, reason: reason ?? null, customerPhone: order.customerPhone, type: order.type, paymentStatus: order.paymentStatus } });
  return ok(order);
}

/**
 * Marks an order paid from the back-office: approves the pending PromptPay/slip payment when there is one,
 * otherwise records a cash payment. markPaid() runs the module handler (order → paid, events).
 */
export async function approveOrderPayment(tx: Tx, tenantId: string, orderId: string, opts: { verifiedBy: string; cash?: boolean }): Promise<Result<{ paymentId: string; amount: number }>> {
  const [order] = await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, orderId))).limit(1);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (order.status === "cancelled") return fail("ออเดอร์นี้ถูกยกเลิกแล้ว", "cancelled");
  if (order.paymentStatus === "paid") return fail("ออเดอร์นี้ชำระแล้ว", "already_paid");
  const existing = order.paymentId ? await getPayment(tx, tenantId, order.paymentId) : null;
  if (existing && (existing.status === "pending" || existing.status === "pending_verification") && !opts.cash) {
    const p = await markPaid(tx, tenantId, existing.id, { verifiedBy: opts.verifiedBy });
    return ok({ paymentId: p.id, amount: p.amount });
  }
  if (existing && (existing.status === "pending" || existing.status === "pending_verification") && opts.cash) {
    await markFailed(tx, tenantId, existing.id, "ชำระเงินสดแทน");
  }
  const cash = await createPayment(tx, tenantId, {
    refType: "rest_order",
    refId: order.id,
    amount: order.total,
    provider: "cash",
    method: "cash",
    customerId: order.customerId,
    metadata: { kind: "order", orderId: order.id, number: order.number, recordedBy: opts.verifiedBy },
  });
  const p = await markPaid(tx, tenantId, cash.id, { verifiedBy: opts.verifiedBy });
  return ok({ paymentId: p.id, amount: p.amount });
}

export async function rejectOrderPayment(tx: Tx, tenantId: string, orderId: string, reason: string): Promise<Result<{ paymentId: string }>> {
  const [order] = await tx.select().from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.id, orderId))).limit(1);
  if (!order) return fail("ไม่พบออเดอร์", "not_found");
  if (!order.paymentId) return fail("ออเดอร์นี้ไม่มีรายการชำระเงิน", "no_payment");
  const p = await getPayment(tx, tenantId, order.paymentId);
  if (!p) return fail("ไม่พบรายการชำระเงิน", "no_payment");
  if (p.status === "paid") return fail("รายการนี้ชำระแล้ว ไม่สามารถปฏิเสธได้", "already_paid");
  await markFailed(tx, tenantId, p.id, reason || "สลิปไม่ถูกต้อง");
  await emitEvent(tx, { tenantId, type: "rest_order.payment_rejected", payload: { orderId: order.id, number: order.number, paymentId: p.id, reason, customerPhone: order.customerPhone } });
  return ok({ paymentId: p.id });
}

export type SettleMode = "cash" | "approve" | "close_only";

/**
 * Closes a table: records the outstanding amount as cash (or approves the guests' PromptPay/slip payment),
 * which marks every order of the session paid through the payment handler, then closes the session.
 */
export async function settleSession(tx: Tx, tenantId: string, sessionId: string, opts: { mode: SettleMode; verifiedBy: string }): Promise<Result<{ sessionId: string; amount: number; paymentId: string | null }>> {
  const summary = await sessionSummary(tx, tenantId, sessionId);
  if (!summary) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  const { session } = summary;
  if (session.status === "closed") return ok({ sessionId, amount: 0, paymentId: session.paymentId });
  let paymentId: string | null = session.paymentId;
  let amount = 0;
  if (session.status !== "paid" && summary.dueTotal > 0) {
    if (opts.mode === "close_only") return fail("โต๊ะนี้ยังค้างชำระอยู่ กรุณารับชำระก่อนปิดโต๊ะ", "due");
    const existing = session.paymentId ? await getPayment(tx, tenantId, session.paymentId) : null;
    if (opts.mode === "approve") {
      if (!existing || (existing.status !== "pending" && existing.status !== "pending_verification")) return fail("ไม่มีรายการชำระเงินที่รออนุมัติ", "no_payment");
      if (existing.amount !== summary.dueTotal) return fail(`ยอดที่ลูกค้าชำระ (฿${existing.amount / 100}) ไม่ตรงกับยอดค้าง (฿${summary.dueTotal / 100}) กรุณารับเป็นเงินสดแทน`, "amount_mismatch");
      const p = await markPaid(tx, tenantId, existing.id, { verifiedBy: opts.verifiedBy });
      paymentId = p.id;
      amount = p.amount;
    } else {
      if (existing && (existing.status === "pending" || existing.status === "pending_verification")) await markFailed(tx, tenantId, existing.id, "ชำระเงินสดแทน");
      const cash = await createPayment(tx, tenantId, {
        refType: "rest_order",
        refId: sessionId,
        amount: summary.dueTotal,
        provider: "cash",
        method: "cash",
        metadata: { kind: "session", sessionId, tableId: session.tableId, recordedBy: opts.verifiedBy },
      });
      await tx.update(tableSessions).set({ paymentId: cash.id }).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId)));
      const p = await markPaid(tx, tenantId, cash.id, { verifiedBy: opts.verifiedBy });
      paymentId = p.id;
      amount = p.amount;
    }
  }
  const closed = await closeSession(tx, tenantId, sessionId);
  if (!closed.ok) return closed;
  return ok({ sessionId, amount, paymentId });
}
