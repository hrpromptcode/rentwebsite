import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, type Tx } from "@rentweb/db";
import { eventSessions, events, ticketOrders, ticketTypes, tickets, type TicketHolderInput, type TicketOrderLine } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import type { TicketStatus } from "./config";
import { TICKET_CODE_ALPHABET, TICKET_CODE_LEN, TICKET_QR_PREFIX, formatTicketCode, normalizeTicketCode } from "./ticket-codes";

export type TicketRow = typeof tickets.$inferSelect;
type OrderRow = typeof ticketOrders.$inferSelect;

/* ------------------------------------------------------------------ */
/* codes & signed QR payloads                                           */
/* ------------------------------------------------------------------ */

export { TICKET_CODE_ALPHABET, TICKET_QR_PREFIX, formatTicketCode, normalizeTicketCode, isSignedTicketPayload } from "./ticket-codes";

export function generateTicketCode(): string {
  let s = "";
  for (let i = 0; i < TICKET_CODE_LEN; i++) s += TICKET_CODE_ALPHABET[randomInt(0, TICKET_CODE_ALPHABET.length)];
  return formatTicketCode(s);
}

function signingKey(): Buffer {
  const raw = process.env.TICKET_SIGNING_SECRET ?? process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("TICKET_SIGNING_SECRET (or SECRETS_ENCRYPTION_KEY) is required in production");
    return Buffer.from("rentweb-dev-ticket-signing-key");
  }
  return Buffer.from(raw);
}

export interface TicketQrPayload {
  tenantId: string;
  ticketId: string;
  code: string;
}

function mac(parts: string[]): string {
  return createHmac("sha256", signingKey()).update(parts.join(".")).digest("base64url");
}

/** `RWT1.<tenantId>.<ticketId>.<code>.<hmac>` – what the ticket's QR encodes. Tenant-scoped and unguessable. */
export function signTicketPayload(p: TicketQrPayload): string {
  const body = [TICKET_QR_PREFIX, p.tenantId, p.ticketId, p.code];
  return [...body, mac(body)].join(".");
}

/** Verifies a scanned string; null when it is not a signed payload of this deployment (tampered / foreign). */
export function verifyTicketPayload(scanned: string | null | undefined): TicketQrPayload | null {
  if (!scanned) return null;
  const parts = scanned.trim().split(".");
  if (parts.length !== 5 || parts[0] !== TICKET_QR_PREFIX) return null;
  const [, tenantId, ticketId, code, sig] = parts as [string, string, string, string, string];
  if (!isUuid(tenantId) || !isUuid(ticketId) || !sig) return null;
  const expected = mac([TICKET_QR_PREFIX, tenantId, ticketId, code]);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { tenantId, ticketId, code };
}

/** PNG data URL of the ticket QR (server side; `qrcode` is loaded lazily). */
export async function ticketQrDataUrl(payload: string, opts: { width?: number } = {}): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: opts.width ?? 512 });
}

/* ------------------------------------------------------------------ */
/* issue / void                                                         */
/* ------------------------------------------------------------------ */

/** Codes not yet used by this tenant (regenerates the rare collision). */
async function uniqueCodes(tx: Tx, tenantId: string, n: number): Promise<string[]> {
  const out = new Set<string>();
  while (out.size < n) {
    const batch: string[] = [];
    while (batch.length + out.size < n) {
      const c = generateTicketCode();
      if (!out.has(c)) batch.push(c);
    }
    const taken = new Set(
      (await tx.select({ code: tickets.code }).from(tickets).where(and(eq(tickets.tenantId, tenantId), inArray(tickets.code, batch)))).map((r) => r.code),
    );
    for (const c of batch) if (!taken.has(c)) out.add(c);
  }
  return [...out];
}

/** Per-ticket prices: the line unit price minus a proportional share of the order discount; the last ticket absorbs rounding so Σ = total. */
export function splitTicketPrices(lines: TicketOrderLine[], discount: number, total: number): number[] {
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const prices: number[] = [];
  for (const l of lines) {
    const perTicket = subtotal > 0 ? l.unitPrice - Math.floor((discount * l.unitPrice) / subtotal) : 0;
    for (let i = 0; i < l.qty; i++) prices.push(Math.max(0, perTicket));
  }
  const sum = prices.reduce((s, p) => s + p, 0);
  if (prices.length && sum !== total) prices[prices.length - 1] = Math.max(0, prices[prices.length - 1]! + (total - sum));
  return prices;
}

/**
 * Creates one ticket per attendee for a paid order (idempotent: existing tickets are returned). Holder names come from
 * `order.metadata.holders` (matched per ticket type, in order), falling back to the order contact.
 */
export async function issueTicketsForOrder(tx: Tx, tenantId: string, order: OrderRow): Promise<TicketRow[]> {
  const existing = await listTicketsForOrder(tx, tenantId, order.id);
  if (existing.length) return existing;
  const lines = order.lines ?? [];
  const n = lines.reduce((s, l) => s + l.qty, 0);
  if (!n) return [];
  const codes = await uniqueCodes(tx, tenantId, n);
  const prices = splitTicketPrices(lines, order.discount, order.total);
  const holders = [...((order.metadata?.holders ?? []) as TicketHolderInput[])];
  const values: Array<typeof tickets.$inferInsert> = [];
  let i = 0;
  for (const l of lines) {
    for (let k = 0; k < l.qty; k++) {
      const hi = holders.findIndex((h) => h.ticketTypeId === l.ticketTypeId);
      const holder = hi === -1 ? null : holders.splice(hi, 1)[0]!;
      values.push({
        tenantId,
        orderId: order.id,
        eventId: order.eventId,
        sessionId: order.sessionId,
        ticketTypeId: l.ticketTypeId,
        code: codes[i]!,
        holderName: holder?.name?.trim() || order.contactName,
        holderEmail: holder?.email?.trim() || order.contactEmail,
        price: prices[i] ?? 0,
        status: "valid",
      });
      i++;
    }
  }
  return tx.insert(tickets).values(values).returning();
}

/** Marks every live ticket (valid / checked_in) of the order void or refunded. Returns the affected rows. */
export async function voidTicketsForOrder(tx: Tx, tenantId: string, orderId: string, reason: string, opts: { status?: "void" | "refunded"; ticketIds?: string[] } = {}): Promise<TicketRow[]> {
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.orderId, orderId), inArray(tickets.status, ["valid", "checked_in"])];
  if (opts.ticketIds) {
    if (!opts.ticketIds.length) return [];
    where.push(inArray(tickets.id, opts.ticketIds));
  }
  return tx
    .update(tickets)
    .set({ status: opts.status ?? "void", voidReason: reason })
    .where(and(...where))
    .returning();
}

/* ------------------------------------------------------------------ */
/* reads                                                                */
/* ------------------------------------------------------------------ */

export async function listTicketsForOrder(tx: Tx, tenantId: string, orderId: string): Promise<TicketRow[]> {
  if (!isUuid(orderId)) return [];
  return tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.orderId, orderId)))
    .orderBy(asc(tickets.createdAt), asc(tickets.code));
}

export async function getTicketById(tx: Tx, tenantId: string, id: string): Promise<TicketRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(tickets).where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, id))).limit(1);
  return row ?? null;
}

export async function getTicketByCode(tx: Tx, tenantId: string, code: string): Promise<TicketRow | null> {
  const c = normalizeTicketCode(code);
  if (!c) return null;
  const [row] = await tx.select().from(tickets).where(and(eq(tickets.tenantId, tenantId), eq(tickets.code, c))).limit(1);
  return row ?? null;
}

export interface TicketDetail {
  ticket: TicketRow;
  typeName: string;
  event: { id: string; title: string; slug: string; venueName: string | null; status: string; cover: string | null };
  session: { id: string; name: string | null; startsAt: Date; endsAt: Date; doorsOpen: Date | null; status: string } | null;
  order: { id: string; number: string; status: string; contactName: string; contactPhone: string | null; contactEmail: string | null; customerId: string | null; accessKey: string };
  /** signed payload for the QR */
  qrPayload: string;
}

const detailSelect = {
  ticket: tickets,
  typeName: ticketTypes.name,
  eventId: events.id,
  eventTitle: events.title,
  eventSlug: events.slug,
  eventVenue: events.venueName,
  eventStatus: events.status,
  eventCover: events.cover,
  sessionId: eventSessions.id,
  sessionName: eventSessions.name,
  sessionStarts: eventSessions.startsAt,
  sessionEnds: eventSessions.endsAt,
  sessionDoors: eventSessions.doorsOpen,
  sessionStatus: eventSessions.status,
  orderId: ticketOrders.id,
  orderNumber: ticketOrders.number,
  orderStatus: ticketOrders.status,
  contactName: ticketOrders.contactName,
  contactPhone: ticketOrders.contactPhone,
  contactEmail: ticketOrders.contactEmail,
  customerId: ticketOrders.customerId,
  accessKey: ticketOrders.accessKey,
};

function toDetail(tenantId: string, r: Awaited<ReturnType<typeof detailQuery>>[number]): TicketDetail {
  return {
    ticket: r.ticket,
    typeName: r.typeName,
    event: { id: r.eventId, title: r.eventTitle, slug: r.eventSlug, venueName: r.eventVenue, status: r.eventStatus, cover: r.eventCover },
    session: r.sessionId ? { id: r.sessionId, name: r.sessionName, startsAt: r.sessionStarts!, endsAt: r.sessionEnds!, doorsOpen: r.sessionDoors, status: r.sessionStatus! } : null,
    order: { id: r.orderId, number: r.orderNumber, status: r.orderStatus, contactName: r.contactName, contactPhone: r.contactPhone, contactEmail: r.contactEmail, customerId: r.customerId, accessKey: r.accessKey },
    qrPayload: signTicketPayload({ tenantId, ticketId: r.ticket.id, code: r.ticket.code }),
  };
}

function detailQuery(tx: Tx, tenantId: string) {
  return tx
    .select(detailSelect)
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(ticketOrders, eq(ticketOrders.id, tickets.orderId))
    .leftJoin(eventSessions, eq(eventSessions.id, tickets.sessionId))
    .where(eq(tickets.tenantId, tenantId))
    .$dynamic();
}

export async function getTicketDetail(tx: Tx, tenantId: string, ticketId: string): Promise<TicketDetail | null> {
  if (!isUuid(ticketId)) return null;
  const [r] = await detailQuery(tx, tenantId).where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId))).limit(1);
  return r ? toDetail(tenantId, r) : null;
}

/** Tickets of an order with event / session / type context (customer ticket wallet, e-mails). */
export async function listTicketDetailsForOrder(tx: Tx, tenantId: string, orderId: string): Promise<TicketDetail[]> {
  if (!isUuid(orderId)) return [];
  const rows = await detailQuery(tx, tenantId)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.orderId, orderId)))
    .orderBy(asc(tickets.createdAt), asc(tickets.code));
  return rows.map((r) => toDetail(tenantId, r));
}

export interface AttendeeFilter {
  eventId: string;
  sessionId?: string | null;
  ticketTypeId?: string | null;
  status?: TicketStatus | TicketStatus[] | null;
  /** holder name / e-mail / code / order number / contact phone */
  q?: string | null;
  page?: number;
  pageSize?: number;
}

/** Admin attendee list (paged). */
export async function listAttendees(tx: Tx, tenantId: string, f: AttendeeFilter): Promise<{ items: TicketDetail[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.eventId, f.eventId)];
  if (f.sessionId) where.push(eq(tickets.sessionId, f.sessionId));
  if (f.ticketTypeId) where.push(eq(tickets.ticketTypeId, f.ticketTypeId));
  if (f.status) where.push(Array.isArray(f.status) ? inArray(tickets.status, f.status) : eq(tickets.status, f.status));
  if (f.q?.trim()) {
    const raw = f.q.trim().replace(/[%_]/g, "");
    const like = `%${raw}%`;
    const code = normalizeTicketCode(raw);
    where.push(or(ilike(tickets.holderName, like), ilike(tickets.holderEmail, like), ilike(ticketOrders.number, like), ilike(ticketOrders.contactPhone, like), ilike(ticketOrders.contactName, like), ...(code ? [eq(tickets.code, code)] : []))!);
  }
  const base = tx
    .select({ n: count() })
    .from(tickets)
    .innerJoin(ticketOrders, eq(ticketOrders.id, tickets.orderId))
    .where(and(...where));
  const [[c], rows] = await Promise.all([
    base,
    detailQuery(tx, tenantId)
      .where(and(...where))
      .orderBy(desc(tickets.createdAt), asc(tickets.code))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return { items: rows.map((r) => toDetail(tenantId, r)), total: Number(c?.n ?? 0), page, pageSize };
}

export async function updateTicketHolder(tx: Tx, tenantId: string, ticketId: string, patch: { holderName?: string; holderEmail?: string | null; seatLabel?: string | null }): Promise<TicketRow | null> {
  if (!isUuid(ticketId)) return null;
  const set: Partial<typeof tickets.$inferInsert> = {};
  if (patch.holderName !== undefined) set.holderName = patch.holderName.trim() || "ผู้ถือบัตร";
  if (patch.holderEmail !== undefined) set.holderEmail = patch.holderEmail?.trim() || null;
  if (patch.seatLabel !== undefined) set.seatLabel = patch.seatLabel?.trim() || null;
  if (!Object.keys(set).length) return getTicketById(tx, tenantId, ticketId);
  const [row] = await tx
    .update(tickets)
    .set(set)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
    .returning();
  return row ?? null;
}

/** Ticket counts per status for an event (optionally one session). */
export async function ticketCounts(tx: Tx, tenantId: string, eventId: string, sessionId?: string | null): Promise<Record<string, number>> {
  const where = [eq(tickets.tenantId, tenantId), eq(tickets.eventId, eventId)];
  if (sessionId) where.push(eq(tickets.sessionId, sessionId));
  const rows = await tx
    .select({ status: tickets.status, n: count() })
    .from(tickets)
    .where(and(...where))
    .groupBy(tickets.status);
  const out: Record<string, number> = { valid: 0, checked_in: 0, void: 0, refunded: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

