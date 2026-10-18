"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@rentweb/core";
import { checkInByCode, checkInStats, getTicketByCode, getTicketById, isSignedTicketPayload, listRecentCheckIns, normalizeTicketCode, undoCheckIn, verifyTicketPayload, type TicketDetail } from "@rentweb/module-events/admin";
import { gateCodeSchema } from "@rentweb/module-events/admin/schemas";
import { formatThaiSession } from "@rentweb/module-events/admin/ui";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";

export interface GateTicket {
  id: string;
  code: string;
  holderName: string;
  typeName: string;
  seatLabel: string | null;
  eventId: string;
  eventTitle: string;
  sessionLabel: string | null;
  orderNumber: string;
  status: string;
}

export type GateResult =
  | { outcome: "checked_in"; ticket: GateTicket; at: string }
  | { outcome: "already_checked_in"; ticket: GateTicket; at: string | null }
  | { outcome: "rejected"; reason: string; ticket: GateTicket | null }
  | { outcome: "error"; message: string };

export interface GateRecent {
  id: string;
  holderName: string;
  typeName: string;
  code: string;
  at: string | null;
}

export interface GateSnapshot {
  total: number;
  checkedIn: number;
  remaining: number;
  recent: GateRecent[];
  at: string;
}

function toGateTicket(d: TicketDetail): GateTicket {
  return {
    id: d.ticket.id,
    code: d.ticket.code,
    holderName: d.ticket.holderName,
    typeName: d.typeName,
    seatLabel: d.ticket.seatLabel,
    eventId: d.event.id,
    eventTitle: d.event.title,
    sessionLabel: d.session ? `${d.session.name ? `${d.session.name} · ` : ""}${formatThaiSession(d.session.startsAt, d.session.endsAt)}` : null,
    orderNumber: d.order.number,
    status: d.ticket.status,
  };
}

const recentOf = (list: TicketDetail[]): GateRecent[] => list.map((d) => ({ id: d.ticket.id, holderName: d.ticket.holderName, typeName: d.typeName, code: d.ticket.code, at: d.ticket.checkedInAt?.toISOString() ?? null }));

/**
 * One scan: the code (QR payload or typed) is checked in for the selected session. A ticket of another event than the
 * one chosen at this gate is refused before anything is written (wrong_event); everything else is the service's call.
 */
export async function gateCheckInAction(slug: string, input: { code: string; eventId: string | null; sessionId: string | null }): Promise<GateResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  const parsed = gateCodeSchema.safeParse(input);
  if (!parsed.success) return { outcome: "error", message: parsed.error.issues[0]?.message ?? "รหัสไม่ถูกต้อง" };
  const eventId = input.eventId && isUuid(input.eventId) ? input.eventId : null;
  const { loadEventsModuleConfig } = await import("@rentweb/module-events/admin");
  const { getAdminDb } = await import("@rentweb/db");
  const config = (await loadEventsModuleConfig(getAdminDb(), ctx.tenant.id)).events;
  const raw = parsed.data.code.trim();
  const r = await tenantTx(ctx.tenant.id, async (tx) => {
    if (eventId) {
      // refuse tickets of another event before the idempotent check-in touches the row
      let ticketId: string | null = null;
      if (isSignedTicketPayload(raw)) ticketId = verifyTicketPayload(raw)?.ticketId ?? null;
      else {
        const code = normalizeTicketCode(raw);
        if (code) ticketId = (await getTicketByCode(tx, ctx.tenant.id, code))?.id ?? null;
      }
      if (ticketId) {
        const t = await getTicketById(tx, ctx.tenant.id, ticketId);
        if (t && t.eventId !== eventId) {
          const { getTicketDetail } = await import("@rentweb/module-events/admin");
          const d = await getTicketDetail(tx, ctx.tenant.id, t.id);
          return { outcome: "rejected", reason: "wrong_event", ticket: d ? toGateTicket(d) : null } satisfies GateResult;
        }
      }
    }
    const res = await checkInByCode(tx, ctx.tenant.id, { code: raw, sessionId: parsed.data.sessionId, by: ctx.userId, config });
    if (res.outcome === "checked_in") return { outcome: "checked_in", ticket: toGateTicket(res.ticket), at: res.ticket.ticket.checkedInAt?.toISOString() ?? new Date().toISOString() } satisfies GateResult;
    if (res.outcome === "already_checked_in") return { outcome: "already_checked_in", ticket: toGateTicket(res.ticket), at: res.checkedInAt?.toISOString() ?? null } satisfies GateResult;
    return { outcome: "rejected", reason: res.reason, ticket: res.ticket ? toGateTicket(res.ticket) : null } satisfies GateResult;
  });
  if (r.outcome === "checked_in") {
    revalidatePath(`/t/${slug}/events/attendees`);
    revalidatePath(`/t/${slug}/events`);
  }
  return r;
}

export async function gateSnapshotAction(slug: string, eventId: string, sessionId: string | null): Promise<GateSnapshot | null> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(eventId)) return null;
  const sid = sessionId && isUuid(sessionId) ? sessionId : null;
  return tenantTx(ctx.tenant.id, async (tx) => {
    const [stats, recent] = await Promise.all([checkInStats(tx, ctx.tenant.id, eventId, sid), listRecentCheckIns(tx, ctx.tenant.id, { eventId, sessionId: sid, limit: 8 })]);
    return { total: stats.total, checkedIn: stats.checkedIn, remaining: stats.remaining, recent: recentOf(recent), at: new Date().toISOString() };
  });
}

export async function gateUndoAction(slug: string, ticketId: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "staff");
  if (!isUuid(ticketId)) return { ok: false, error: "ไม่พบบัตร" };
  const row = await tenantTx(ctx.tenant.id, (tx) => undoCheckIn(tx, ctx.tenant.id, ticketId));
  if (!row) return { ok: false, error: "บัตรใบนี้ไม่ได้อยู่ในสถานะเช็กอินแล้ว" };
  revalidatePath(`/t/${slug}/events/attendees`);
  return { ok: true, message: `ยกเลิกการเช็กอินของ ${row.holderName} แล้ว` };
}
