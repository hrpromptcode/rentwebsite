import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { diningTables, payments, restaurantOrderItems, restaurantOrders, tableSessions, type Tx } from "@rentweb/db";
import { emitEvent, fail, ok, shortCode, type Result } from "@rentweb/core";
import { createPayment, getPayment } from "@rentweb/core/payments";

/** Cookie remembering which table session this phone belongs to (short shared code). */
export const TABLE_COOKIE = "rw_table";
export const OPEN_SESSION_STATUSES = ["open", "bill_requested"] as const;

export type DiningTable = typeof diningTables.$inferSelect;
export type TableSession = typeof tableSessions.$inferSelect;

export async function getTableByQr(tx: Tx, tenantId: string, qrToken: string): Promise<DiningTable | null> {
  const [row] = await tx
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.qrToken, qrToken), eq(diningTables.active, true)))
    .limit(1);
  return row ?? null;
}

export async function getTable(tx: Tx, tenantId: string, tableId: string): Promise<DiningTable | null> {
  const [row] = await tx.select().from(diningTables).where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.id, tableId))).limit(1);
  return row ?? null;
}

export async function listTables(tx: Tx, tenantId: string, opts: { zone?: string | null; activeOnly?: boolean } = {}): Promise<DiningTable[]> {
  const conds = [eq(diningTables.tenantId, tenantId)];
  if (opts.activeOnly !== false) conds.push(eq(diningTables.active, true));
  if (opts.zone) conds.push(eq(diningTables.zone, opts.zone));
  return tx.select().from(diningTables).where(and(...conds)).orderBy(asc(diningTables.sort), asc(diningTables.name));
}

export async function getOpenSessionForTable(tx: Tx, tenantId: string, tableId: string): Promise<TableSession | null> {
  const [row] = await tx
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.tableId, tableId), inArray(tableSessions.status, [...OPEN_SESSION_STATUSES])))
    .orderBy(desc(tableSessions.openedAt))
    .limit(1);
  return row ?? null;
}

/**
 * One open session per table: returns the current one or opens a new one with a short shareable token.
 * Everyone at the table who scans the QR lands in the same session.
 */
export async function openOrGetSession(tx: Tx, tenantId: string, tableId: string): Promise<{ session: TableSession; created: boolean }> {
  const existing = await getOpenSessionForTable(tx, tenantId, tableId);
  if (existing) return { session: existing, created: false };
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = shortCode("", 6);
    const [clash] = await tx.select({ id: tableSessions.id }).from(tableSessions).where(eq(tableSessions.token, token)).limit(1);
    if (clash) continue;
    const [session] = await tx.insert(tableSessions).values({ tenantId, tableId, token, status: "open" }).returning();
    await emitEvent(tx, { tenantId, type: "table.session_opened", payload: { sessionId: session!.id, tableId } });
    return { session: session!, created: true };
  }
  throw new Error("could not allocate session token");
}

export async function getSessionByToken(tx: Tx, tenantId: string, token: string): Promise<TableSession | null> {
  if (!token) return null;
  const [row] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.token, token.toUpperCase()))).limit(1);
  return row ?? null;
}

export async function getSession(tx: Tx, tenantId: string, sessionId: string): Promise<TableSession | null> {
  const [row] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId))).limit(1);
  return row ?? null;
}

export function isSessionOpen(session: Pick<TableSession, "status"> | null | undefined): boolean {
  return !!session && (OPEN_SESSION_STATUSES as readonly string[]).includes(session.status);
}

export interface SessionOrderSummary {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  total: number;
  guestLabel: string | null;
  note: string | null;
  placedAt: Date;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; total: number; modifiers: Array<{ group: string; name: string; priceDelta: number }>; note: string | null; status: string; station: string }>;
}

export interface SessionSummary {
  session: TableSession;
  table: DiningTable | null;
  orders: SessionOrderSummary[];
  /** sum of all non-cancelled orders */
  total: number;
  paidTotal: number;
  /** what the guests still owe */
  dueTotal: number;
  payment: { id: string; status: string; amount: number; method: string; qrPayload: string | null; expiresAt: Date | null } | null;
}

/** Orders of a session (round history) with their items. */
export async function listSessionOrders(tx: Tx, tenantId: string, sessionId: string): Promise<SessionOrderSummary[]> {
  const orders = await tx
    .select()
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.sessionId, sessionId)))
    .orderBy(asc(restaurantOrders.placedAt));
  if (!orders.length) return [];
  const items = await tx
    .select()
    .from(restaurantOrderItems)
    .where(and(eq(restaurantOrderItems.tenantId, tenantId), inArray(restaurantOrderItems.orderId, orders.map((o) => o.id))))
    .orderBy(asc(restaurantOrderItems.createdAt));
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    guestLabel: o.guestLabel,
    note: o.note,
    placedAt: o.placedAt,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, modifiers: i.modifiers ?? [], note: i.note, status: i.status, station: i.station })),
  }));
}

export async function sessionSummary(tx: Tx, tenantId: string, sessionId: string): Promise<SessionSummary | null> {
  const session = await getSession(tx, tenantId, sessionId);
  if (!session) return null;
  const table = await getTable(tx, tenantId, session.tableId);
  const orders = await listSessionOrders(tx, tenantId, sessionId);
  const live = orders.filter((o) => o.status !== "cancelled");
  const total = live.reduce((s, o) => s + o.total, 0);
  const paidTotal = live.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.total, 0);
  const dueTotal = session.status === "paid" || session.status === "closed" ? 0 : total - paidTotal;
  let payment: SessionSummary["payment"] = null;
  if (session.paymentId) {
    const p = await getPayment(tx, tenantId, session.paymentId);
    if (p) payment = { id: p.id, status: p.status, amount: p.amount, method: p.method, qrPayload: p.qrPayload, expiresAt: p.expiresAt };
  }
  return { session, table, orders, total, paidTotal, dueTotal, payment };
}

/** Guests ask for the bill: either pay now via PromptPay (payment row for the outstanding amount) or at the counter. */
export async function requestBill(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  opts: { method: "promptpay_qr" | "counter"; promptpayId?: string | null; customerId?: string | null },
): Promise<Result<{ session: TableSession; amount: number; payment: typeof payments.$inferSelect | null }>> {
  const summary = await sessionSummary(tx, tenantId, sessionId);
  if (!summary) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (!isSessionOpen(summary.session)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว", "closed");
  if (summary.dueTotal <= 0) return fail("ยังไม่มีรายการที่ต้องชำระ", "nothing_due");

  let payment: typeof payments.$inferSelect | null = null;
  if (opts.method === "promptpay_qr") {
    if (!opts.promptpayId) return fail("ร้านยังไม่ได้ตั้งค่า PromptPay", "no_promptpay");
    // reuse a pending QR for the same amount instead of issuing a new one on every tap
    const existing = summary.session.paymentId ? await getPayment(tx, tenantId, summary.session.paymentId) : null;
    if (existing && existing.status === "pending" && existing.amount === summary.dueTotal && (!existing.expiresAt || existing.expiresAt > new Date())) {
      payment = existing;
    } else {
      payment = await createPayment(tx, tenantId, {
        refType: "rest_order",
        refId: sessionId,
        amount: summary.dueTotal,
        provider: "promptpay",
        method: "promptpay_qr",
        customerId: opts.customerId ?? null,
        promptpayId: opts.promptpayId,
        expiresMinutes: 30,
        metadata: { kind: "session", sessionId, tableId: summary.session.tableId },
      });
    }
  }
  const [session] = await tx
    .update(tableSessions)
    .set({ status: "bill_requested", total: summary.total, paymentId: payment?.id ?? summary.session.paymentId ?? null })
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId)))
    .returning();
  await emitEvent(tx, { tenantId, type: "table.bill_requested", payload: { sessionId, tableId: session!.tableId, method: opts.method, amount: summary.dueTotal, paymentId: payment?.id ?? null } });
  return ok({ session: session!, amount: summary.dueTotal, payment });
}

export async function callStaff(tx: Tx, tenantId: string, sessionId: string, note?: string | null): Promise<Result<{ sessionId: string }>> {
  const session = await getSession(tx, tenantId, sessionId);
  if (!session) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (!isSessionOpen(session)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว", "closed");
  await emitEvent(tx, { tenantId, type: "table.call_staff", payload: { sessionId, tableId: session.tableId, note: note ?? null } });
  return ok({ sessionId });
}

/** Staff closes the table after payment; marks the remaining open orders completed. */
export async function closeSession(tx: Tx, tenantId: string, sessionId: string): Promise<Result<TableSession>> {
  const session = await getSession(tx, tenantId, sessionId);
  if (!session) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (session.status === "closed") return ok(session);
  const summary = await sessionSummary(tx, tenantId, sessionId);
  const [updated] = await tx
    .update(tableSessions)
    .set({ status: "closed", closedAt: new Date(), total: summary?.total ?? session.total })
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId)))
    .returning();
  await tx
    .update(restaurantOrders)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.sessionId, sessionId), ne(restaurantOrders.status, "cancelled"), ne(restaurantOrders.status, "completed")));
  await emitEvent(tx, { tenantId, type: "table.session_closed", payload: { sessionId, tableId: session.tableId, total: updated!.total } });
  return ok(updated!);
}
