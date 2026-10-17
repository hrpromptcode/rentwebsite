import { and, asc, desc, eq, inArray, max, ne } from "drizzle-orm";
import { diningTables, payments, restaurantOrderItems, restaurantOrders, tableSessions, type Tx } from "@rentweb/db";
import { emitEvent, fail, isUuid, ok, shortCode, type Result } from "@rentweb/core";
import { cancelPayment, createPayment, getPayment, isPaymentStateError } from "@rentweb/core/payments";

/** Cookie remembering which table session this phone belongs to (short shared code). */
export const TABLE_COOKIE = "rw_table";
/** statuses guests can still order into (the one-open-session-per-table unique index covers exactly these) */
export const OPEN_SESSION_STATUSES = ["open", "bill_requested"] as const;
/**
 * statuses staff still has to act on: open ones, fully paid ones (close the table) and sessions the system
 * retired while money was still due ("expired", SBR-006) – they stay on the board until settled.
 */
export const ACTIVE_SESSION_STATUSES = ["open", "bill_requested", "paid", "expired"] as const;
/** default lifetime of a table session (overridable through moduleConfig.restaurant) */
export const SESSION_IDLE_MINUTES = 240;
export const SESSION_MAX_HOURS = 12;

export type DiningTable = typeof diningTables.$inferSelect;
export type TableSession = typeof tableSessions.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

/** Session tokens are shortCode(6) = [A-Z0-9]; anything else never reaches Postgres (COR-22). */
export function isSessionToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9]{4,12}$/.test(token);
}
/** QR tokens are `{tenant8}-{slug}-{rand6}` (URL-safe). */
export function isQrToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(token);
}

export async function getTableByQr(tx: Tx, tenantId: string, qrToken: string): Promise<DiningTable | null> {
  if (!isQrToken(qrToken)) return null;
  const [row] = await tx
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.tenantId, tenantId), eq(diningTables.qrToken, qrToken), eq(diningTables.active, true)))
    .limit(1);
  return row ?? null;
}

export async function getTable(tx: Tx, tenantId: string, tableId: string): Promise<DiningTable | null> {
  if (!isUuid(tableId)) return null;
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

export interface SessionLifetime {
  now?: Date;
  /** no new order for this long → the next scan opens a new session */
  idleMinutes?: number;
  /** session older than this → the next scan opens a new session */
  maxHours?: number;
}

/** Last time anything happened at the table: session opened or the latest round placed. */
async function lastActivity(tx: Tx, tenantId: string, session: TableSession): Promise<Date> {
  const [row] = await tx
    .select({ at: max(restaurantOrders.placedAt) })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.sessionId, session.id)));
  const last = row?.at ? new Date(row.at) : null;
  return last && last > session.openedAt ? last : session.openedAt;
}

export async function isSessionStale(tx: Tx, tenantId: string, session: TableSession, opts: SessionLifetime = {}): Promise<boolean> {
  const now = (opts.now ?? new Date()).getTime();
  const idle = (opts.idleMinutes ?? SESSION_IDLE_MINUTES) * 60_000;
  const maxAge = (opts.maxHours ?? SESSION_MAX_HOURS) * 3_600_000;
  if (now - session.openedAt.getTime() > maxAge) return true;
  return now - (await lastActivity(tx, tenantId, session)).getTime() > idle;
}

/**
 * Retires a stale open session (SBR-006) so the next guests start fresh: nothing due → closed (orders completed);
 * money still due → "expired" (kept on the staff board to settle, guests can no longer order into it).
 * Conditional on the session still being open, so concurrent scans retire it once.
 */
export async function retireSession(tx: Tx, tenantId: string, session: TableSession, reason = "หมดเวลาใช้โต๊ะ"): Promise<TableSession | null> {
  const summary = await sessionSummary(tx, tenantId, session.id);
  if (!summary) return null;
  const due = summary.dueTotal > 0;
  const [updated] = await tx
    .update(tableSessions)
    .set({ status: due ? "expired" : "closed", closedAt: new Date(), total: summary.total })
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, session.id), inArray(tableSessions.status, [...OPEN_SESSION_STATUSES])))
    .returning();
  if (!updated) return null;
  if (updated.paymentId) await voidPendingPayment(tx, tenantId, updated.paymentId, reason);
  if (!due) {
    await tx
      .update(restaurantOrders)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(restaurantOrders.tenantId, tenantId), eq(restaurantOrders.sessionId, session.id), ne(restaurantOrders.status, "cancelled"), ne(restaurantOrders.status, "completed")));
  }
  await emitEvent(tx, {
    tenantId,
    type: due ? "table.session_expired" : "table.session_closed",
    payload: { sessionId: session.id, tableId: session.tableId, total: summary.total, dueTotal: summary.dueTotal, reason, by: "system" },
  });
  return updated;
}

/**
 * One open session per table: returns the current one or opens a new one with a short shareable token.
 * Everyone at the table who scans the QR lands in the same session. A stale session (idle / too old, SBR-006)
 * is retired first. Parallel scans are safe (COR-26): the partial unique index table_sessions_open_table_uq
 * rejects a second open session for the table, the loser re-reads the winner's session.
 */
export async function openOrGetSession(tx: Tx, tenantId: string, tableId: string, opts: SessionLifetime = {}): Promise<{ session: TableSession; created: boolean }> {
  const existing = await getOpenSessionForTable(tx, tenantId, tableId);
  if (existing) {
    if (!(await isSessionStale(tx, tenantId, existing, opts))) return { session: existing, created: false };
    await retireSession(tx, tenantId, existing);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = shortCode("", 6);
    const [session] = await tx.insert(tableSessions).values({ tenantId, tableId, token, status: "open" }).onConflictDoNothing().returning();
    if (session) {
      await emitEvent(tx, { tenantId, type: "table.session_opened", payload: { sessionId: session.id, tableId } });
      return { session, created: true };
    }
    // a concurrent scan opened the table's session first (or the random token clashed → retry)
    const winner = await getOpenSessionForTable(tx, tenantId, tableId);
    if (winner) return { session: winner, created: false };
  }
  throw new Error("could not allocate session token");
}

/** how long after the table was settled the paying guests' browser keeps showing the paid state */
export const SETTLED_VIEW_MINUTES = 60;

/**
 * The settled session the guest's own browser belongs to (its rw_table cookie): paid, or closed by staff after
 * payment, at this table, not superseded by a newer session and recent. Reloading the table page shows that paid
 * state (no call-staff / bill / ordering, which the API refuses) instead of quietly opening a fresh session for the
 * same guests; "สั่งรอบใหม่" drops the cookie to start one. Anyone else scanning the QR still gets an open session.
 */
export async function getSettledGuestSession(
  tx: Tx,
  tenantId: string,
  tableId: string,
  token: string | null | undefined,
  opts: SessionLifetime = {},
): Promise<TableSession | null> {
  if (!token || !isSessionToken(token)) return null;
  const s = await getSessionByToken(tx, tenantId, token);
  if (!s || s.tableId !== tableId || (s.status !== "paid" && s.status !== "closed")) return null;
  // newer guests already opened the table: they (and this browser) share that session
  if (await getOpenSessionForTable(tx, tenantId, tableId)) return null;
  const now = (opts.now ?? new Date()).getTime();
  if (now - s.openedAt.getTime() > (opts.maxHours ?? SESSION_MAX_HOURS) * 3_600_000) return null;
  // only a table that was actually paid (an empty session closed by staff is not a "paid" state)
  const summary = await sessionSummary(tx, tenantId, s.id);
  if (!summary || summary.paidTotal <= 0 || summary.dueTotal > 0) return null;
  const paidAt = s.paymentId ? ((await getPayment(tx, tenantId, s.paymentId))?.paidAt ?? null) : null;
  const settledAt = s.closedAt ?? paidAt ?? (await lastActivity(tx, tenantId, s));
  if (now - settledAt.getTime() > SETTLED_VIEW_MINUTES * 60_000) return null;
  return s;
}

export async function getSessionByToken(tx: Tx, tenantId: string, token: string): Promise<TableSession | null> {
  if (!isSessionToken(token)) return null;
  const [row] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.token, token.toUpperCase()))).limit(1);
  return row ?? null;
}

export async function getSession(tx: Tx, tenantId: string, sessionId: string): Promise<TableSession | null> {
  if (!isUuid(sessionId)) return null;
  const [row] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId))).limit(1);
  return row ?? null;
}

/**
 * Row-locks a session for a bill change. Locks its current bill payment row FIRST, in the order markPaid()
 * takes them (payment UPDATE → paid handler locks the session), so a concurrent slip approval and a new
 * round / bill request serialise instead of deadlocking.
 */
export async function lockSession(tx: Tx, tenantId: string, sessionId: string): Promise<TableSession | null> {
  if (!isUuid(sessionId)) return null;
  const [peek] = await tx.select({ paymentId: tableSessions.paymentId }).from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId))).limit(1);
  if (!peek) return null;
  if (peek.paymentId) await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, peek.paymentId))).for("update");
  const [row] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId))).limit(1).for("update");
  return row ?? null;
}

export function isSessionOpen(session: Pick<TableSession, "status"> | null | undefined): boolean {
  return !!session && (OPEN_SESSION_STATUSES as readonly string[]).includes(session.status);
}

/** An order the guests still owe: not cancelled and neither paid nor refunded. */
export function isOrderDue(o: { status: string; paymentStatus: string }): boolean {
  return o.status !== "cancelled" && (o.paymentStatus === "unpaid" || o.paymentStatus === "pay_at_counter");
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
  /** what the guests still owe (sum of the due orders) */
  dueTotal: number;
  /** ids of the due orders – the exact snapshot a bill payment covers (COR-07) */
  dueOrderIds: string[];
  payment: { id: string; status: string; amount: number; method: string; qrPayload: string | null; expiresAt: Date | null; slipUrl: string | null } | null;
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
  const due = session.status === "closed" ? [] : orders.filter(isOrderDue);
  const dueTotal = due.reduce((s, o) => s + o.total, 0);
  let payment: SessionSummary["payment"] = null;
  if (session.paymentId) {
    const p = await getPayment(tx, tenantId, session.paymentId);
    if (p) payment = { id: p.id, status: p.status, amount: p.amount, method: p.method, qrPayload: p.qrPayload, expiresAt: p.expiresAt, slipUrl: p.slipUrl ?? null };
  }
  return { session, table, orders, total, paidTotal, dueTotal, dueOrderIds: due.map((o) => o.id), payment };
}

/** metadata of a table-bill payment (refType rest_order, refId = session id) */
export interface SessionBillMeta {
  kind: "session";
  sessionId: string;
  tableId: string;
  /** the exact orders this payment pays for (COR-07); legacy payments without it cover the orders placed before the payment */
  orderIds?: string[];
  recordedBy?: string;
}

export function sessionBillMeta(p: Pick<PaymentRow, "providerPayload"> | null | undefined): SessionBillMeta | null {
  const meta = (p?.providerPayload ?? null) as Partial<SessionBillMeta> | null;
  return meta?.kind === "session" ? (meta as SessionBillMeta) : null;
}

function sameOrders(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Voids an unpaid (pending, no slip yet) payment; one that got paid / slipped meanwhile is left alone. */
export async function voidPendingPayment(tx: Tx, tenantId: string, paymentId: string, reason: string): Promise<boolean> {
  const p = await getPayment(tx, tenantId, paymentId);
  if (!p || p.status !== "pending") return false;
  try {
    await cancelPayment(tx, tenantId, p.id, reason, { runHandler: false });
    return true;
  } catch (err) {
    if (isPaymentStateError(err)) return false;
    throw err;
  }
}

/**
 * The table's bill changed (new round, cancelled order): void the pending bill QR so it can never be paid for a
 * stale amount (COR-07 / SBR-005). The guests request the bill again and get a QR for the new due amount.
 * A QR with an uploaded slip is kept (the guests paid it; it only ever covers its own snapshot of orders).
 * Call with the session locked (lockSession).
 */
export async function voidSessionBill(tx: Tx, tenantId: string, session: TableSession, reason: string): Promise<TableSession> {
  if (!session.paymentId) return session;
  if (!(await voidPendingPayment(tx, tenantId, session.paymentId, reason))) return session;
  const [updated] = await tx
    .update(tableSessions)
    .set({ paymentId: null, ...(session.status === "bill_requested" ? { status: "open" } : {}) })
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, session.id)))
    .returning();
  return updated ?? session;
}

/**
 * Guests ask for the bill: either pay now via PromptPay or at the counter. The PromptPay payment is a snapshot
 * (metadata.orderIds + amount) of the orders due right now; the paid handler pays exactly those orders.
 */
export async function requestBill(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  opts: { method: "promptpay_qr" | "counter"; promptpayId?: string | null; customerId?: string | null },
): Promise<Result<{ session: TableSession; amount: number; payment: PaymentRow | null }>> {
  const locked = await lockSession(tx, tenantId, sessionId);
  if (!locked) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (!isSessionOpen(locked)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว", "closed");
  const summary = (await sessionSummary(tx, tenantId, sessionId))!;
  if (summary.dueTotal <= 0) return fail("ยังไม่มีรายการที่ต้องชำระ", "nothing_due");

  const existing = locked.paymentId ? await getPayment(tx, tenantId, locked.paymentId) : null;
  let payment: PaymentRow | null = null;
  if (opts.method === "promptpay_qr") {
    if (!opts.promptpayId) return fail("ร้านยังไม่ได้ตั้งค่า PromptPay", "no_promptpay");
    if (existing?.status === "pending_verification") return fail("ร้านกำลังตรวจสอบสลิปของบิลก่อนหน้า กรุณารอสักครู่หรือเรียกพนักงาน", "verifying");
    // reuse the pending QR only when it is for exactly the same orders and amount (never a stale bill)
    const reusable =
      !!existing &&
      existing.status === "pending" &&
      existing.amount === summary.dueTotal &&
      sameOrders(sessionBillMeta(existing)?.orderIds, summary.dueOrderIds) &&
      (!existing.expiresAt || existing.expiresAt > new Date());
    if (reusable) {
      payment = existing;
    } else {
      if (existing && existing.status === "pending") await voidPendingPayment(tx, tenantId, existing.id, "ออกบิลใหม่");
      const meta: SessionBillMeta = { kind: "session", sessionId, tableId: locked.tableId, orderIds: summary.dueOrderIds };
      payment = await createPayment(tx, tenantId, {
        refType: "rest_order",
        refId: sessionId,
        amount: summary.dueTotal,
        provider: "promptpay",
        method: "promptpay_qr",
        customerId: opts.customerId ?? null,
        promptpayId: opts.promptpayId,
        expiresMinutes: 30,
        metadata: { ...meta },
      });
    }
  }
  const [session] = await tx
    .update(tableSessions)
    .set({ status: "bill_requested", total: summary.total, paymentId: payment?.id ?? locked.paymentId ?? null })
    .where(and(eq(tableSessions.tenantId, tenantId), eq(tableSessions.id, sessionId)))
    .returning();
  await emitEvent(tx, { tenantId, type: "table.bill_requested", payload: { sessionId, tableId: session!.tableId, method: opts.method, amount: summary.dueTotal, total: summary.dueTotal, paymentId: payment?.id ?? null } });
  return ok({ session: session!, amount: summary.dueTotal, payment });
}

export async function callStaff(tx: Tx, tenantId: string, sessionId: string, note?: string | null): Promise<Result<{ sessionId: string }>> {
  const session = await getSession(tx, tenantId, sessionId);
  if (!session) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (!isSessionOpen(session)) return fail("รอบการใช้โต๊ะนี้ปิดแล้ว", "closed");
  await emitEvent(tx, { tenantId, type: "table.call_staff", payload: { sessionId, tableId: session.tableId, note: note ?? null, reason: note ?? null } });
  return ok({ sessionId });
}

/** Staff closes the table after payment; marks the remaining open orders completed and voids an unpaid bill QR. */
export async function closeSession(tx: Tx, tenantId: string, sessionId: string): Promise<Result<TableSession>> {
  const session = await lockSession(tx, tenantId, sessionId);
  if (!session) return fail("ไม่พบรอบการใช้โต๊ะนี้", "not_found");
  if (session.status === "closed") return ok(session);
  const summary = await sessionSummary(tx, tenantId, sessionId);
  if (session.paymentId) await voidPendingPayment(tx, tenantId, session.paymentId, "ปิดโต๊ะแล้ว");
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
