import { and, asc, count, desc, eq, inArray, isNotNull, sql, type Tx } from "@rentweb/db";
import { eventSessions, ticketTypes, tickets } from "@rentweb/db";
import { emitEvent, isUuid } from "@rentweb/core";
import type { EventsConfig } from "./config";
import { bkkDayBounds } from "./time";
import { getTicketDetail, isSignedTicketPayload, normalizeTicketCode, verifyTicketPayload, type TicketDetail, type TicketRow } from "./tickets";

export type CheckInReason =
  | "unknown"
  | "invalid_signature"
  | "wrong_tenant"
  | "void"
  | "refunded"
  | "wrong_session"
  | "wrong_day"
  | "too_early"
  | "session_cancelled"
  | "event_cancelled"
  | "not_paid";

export type CheckInResult =
  | { outcome: "checked_in"; ticket: TicketDetail }
  | { outcome: "already_checked_in"; ticket: TicketDetail; checkedInAt: Date; checkedInBy: string | null }
  | { outcome: "rejected"; reason: CheckInReason; ticket: TicketDetail | null };

export interface CheckInInput {
  /** scanned QR payload (RWT1.…) or a typed code (ABCD-EFGH-JKLM) */
  code: string;
  /** the session the gate is scanning for; a ticket of another session is rejected with wrong_session */
  sessionId?: string | null;
  /** admin user id / device label stored on the ticket */
  by?: string | null;
  now?: Date;
  config: Pick<EventsConfig, "enforceSessionDay" | "checkInOpensMinutesBefore">;
}

/**
 * Idempotent check-in. The ticket row is locked; the first call moves it to checked_in, later calls report
 * already_checked_in with the original time. Rejections never change anything.
 */
export async function checkInByCode(tx: Tx, tenantId: string, input: CheckInInput): Promise<CheckInResult> {
  const now = input.now ?? new Date();
  const raw = input.code.trim();
  let ticketId: string | null = null;
  let code: string | null = null;
  if (isSignedTicketPayload(raw)) {
    const p = verifyTicketPayload(raw);
    if (!p) return { outcome: "rejected", reason: "invalid_signature", ticket: null };
    if (p.tenantId !== tenantId) return { outcome: "rejected", reason: "wrong_tenant", ticket: null };
    ticketId = p.ticketId;
    code = p.code;
  } else {
    code = normalizeTicketCode(raw);
    if (!code) return { outcome: "rejected", reason: "unknown", ticket: null };
  }
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.code, code)];
  if (ticketId) where.push(eq(tickets.id, ticketId));
  const [row] = await tx
    .select()
    .from(tickets)
    .where(and(...where))
    .limit(1)
    .for("update");
  if (!row) return { outcome: "rejected", reason: "unknown", ticket: null };
  const detail = (await getTicketDetail(tx, tenantId, row.id))!;

  if (row.status === "checked_in") return { outcome: "already_checked_in", ticket: detail, checkedInAt: row.checkedInAt ?? row.updatedAt, checkedInBy: row.checkedInBy };
  if (row.status === "void") return { outcome: "rejected", reason: "void", ticket: detail };
  if (row.status === "refunded") return { outcome: "rejected", reason: "refunded", ticket: detail };
  if (detail.order.status !== "paid") return { outcome: "rejected", reason: "not_paid", ticket: detail };
  if (detail.event.status === "cancelled") return { outcome: "rejected", reason: "event_cancelled", ticket: detail };
  if (detail.session) {
    if (detail.session.status === "cancelled") return { outcome: "rejected", reason: "session_cancelled", ticket: detail };
    if (input.sessionId && detail.session.id !== input.sessionId) return { outcome: "rejected", reason: "wrong_session", ticket: detail };
    if (input.config.enforceSessionDay) {
      const { start } = bkkDayBounds(detail.session.startsAt);
      const { end } = bkkDayBounds(detail.session.endsAt);
      if (now.getTime() < start.getTime() || now.getTime() >= end.getTime()) return { outcome: "rejected", reason: "wrong_day", ticket: detail };
    }
    if (input.config.checkInOpensMinutesBefore > 0) {
      const opensAt = (detail.session.doorsOpen ?? detail.session.startsAt).getTime() - input.config.checkInOpensMinutesBefore * 60_000;
      if (now.getTime() < opensAt) return { outcome: "rejected", reason: "too_early", ticket: detail };
    }
  }
  // a session-less ticket (event without sessions) scanned at a session gate is accepted

  const [updated] = await tx
    .update(tickets)
    .set({ status: "checked_in", checkedInAt: now, checkedInBy: input.by?.trim() || null })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, row.id), eq(tickets.status, "valid")))
    .returning();
  if (!updated) {
    // lost a race despite the lock (should not happen): report what is there now
    const again = (await getTicketDetail(tx, tenantId, row.id))!;
    return { outcome: "already_checked_in", ticket: again, checkedInAt: again.ticket.checkedInAt ?? now, checkedInBy: again.ticket.checkedInBy };
  }
  await emitEvent(tx, {
    tenantId,
    type: "ticket.checked_in",
    payload: { ticketId: row.id, code: row.code, orderId: row.orderId, orderNumber: detail.order.number, eventId: row.eventId, eventTitle: detail.event.title, sessionId: row.sessionId, holderName: row.holderName, ticketTypeName: detail.typeName, checkedInAt: now, by: input.by ?? null, customerId: detail.order.customerId, phone: detail.order.contactPhone, email: detail.order.contactEmail },
  });
  return { outcome: "checked_in", ticket: { ...detail, ticket: updated } };
}

/** Reverts a mistaken check-in (admin). Returns the ticket or null when it was not checked in. */
export async function undoCheckIn(tx: Tx, tenantId: string, ticketId: string): Promise<TicketRow | null> {
  if (!isUuid(ticketId)) return null;
  const [row] = await tx
    .update(tickets)
    .set({ status: "valid", checkedInAt: null, checkedInBy: null })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId), eq(tickets.status, "checked_in")))
    .returning();
  return row ?? null;
}

export interface CheckInStats {
  /** live tickets (valid + checked_in) */
  total: number;
  checkedIn: number;
  remaining: number;
  byType: Array<{ ticketTypeId: string; name: string; total: number; checkedIn: number }>;
  bySession: Array<{ sessionId: string | null; name: string | null; startsAt: Date | null; total: number; checkedIn: number }>;
  /** last check-in instant */
  lastCheckInAt: Date | null;
}

/** Gate dashboard numbers for an event (optionally one session). */
export async function checkInStats(tx: Tx, tenantId: string, eventId: string, sessionId?: string | null): Promise<CheckInStats> {
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.eventId, eventId), inArray(tickets.status, ["valid", "checked_in"])];
  if (sessionId) where.push(eq(tickets.sessionId, sessionId));
  const checkedInExpr = sql<string>`sum(case when ${tickets.status} = 'checked_in' then 1 else 0 end)`;
  const [byType, bySession, [last]] = await Promise.all([
    tx
      .select({ ticketTypeId: tickets.ticketTypeId, name: ticketTypes.name, total: count(), checkedIn: checkedInExpr })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .where(and(...where))
      .groupBy(tickets.ticketTypeId, ticketTypes.name, ticketTypes.sort)
      .orderBy(asc(ticketTypes.sort), asc(ticketTypes.name)),
    tx
      .select({ sessionId: tickets.sessionId, name: eventSessions.name, startsAt: eventSessions.startsAt, total: count(), checkedIn: checkedInExpr })
      .from(tickets)
      .leftJoin(eventSessions, eq(eventSessions.id, tickets.sessionId))
      .where(and(...where))
      .groupBy(tickets.sessionId, eventSessions.name, eventSessions.startsAt)
      .orderBy(sql`${eventSessions.startsAt} asc nulls first`),
    tx
      .select({ at: sql<Date | null>`max(${tickets.checkedInAt})` })
      .from(tickets)
      .where(and(...where, isNotNull(tickets.checkedInAt))),
  ]);
  const types = byType.map((r) => ({ ticketTypeId: r.ticketTypeId, name: r.name, total: Number(r.total), checkedIn: Number(r.checkedIn ?? 0) }));
  const total = types.reduce((s, t) => s + t.total, 0);
  const checkedIn = types.reduce((s, t) => s + t.checkedIn, 0);
  const at = last?.at;
  return {
    total,
    checkedIn,
    remaining: total - checkedIn,
    byType: types,
    bySession: bySession.map((r) => ({ sessionId: r.sessionId, name: r.name, startsAt: r.startsAt, total: Number(r.total), checkedIn: Number(r.checkedIn ?? 0) })),
    lastCheckInAt: at == null ? null : at instanceof Date ? at : new Date(String(at)),
  };
}

/** Latest check-ins for the gate screen's activity feed. */
export async function listRecentCheckIns(tx: Tx, tenantId: string, opts: { eventId: string; sessionId?: string | null; limit?: number }): Promise<TicketDetail[]> {
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.eventId, opts.eventId), eq(tickets.status, "checked_in")];
  if (opts.sessionId) where.push(eq(tickets.sessionId, opts.sessionId));
  const rows = await tx
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(...where))
    .orderBy(desc(tickets.checkedInAt))
    .limit(Math.min(100, opts.limit ?? 20));
  const out: TicketDetail[] = [];
  for (const r of rows) {
    const d = await getTicketDetail(tx, tenantId, r.id);
    if (d) out.push(d);
  }
  return out;
}
