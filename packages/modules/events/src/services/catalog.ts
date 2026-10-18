import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, lt, or, sql, type Tx } from "@rentweb/db";
import { eventPromoCodes, eventSessions, events, ticketOrders, ticketTypes } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { sanitizeHtml, stripHtml } from "../lib/sanitize";
import { eventInputSchema, promoCodeInputSchema, sessionInputSchema, ticketTypeInputSchema, type EventInput, type PromoCodeInput, type SessionInput, type TicketTypeInput } from "./catalog-schemas";
import type { EventStatus } from "./config";

export type EventRow = typeof events.$inferSelect;
export type SessionRow = typeof eventSessions.$inferSelect;
export type TicketTypeRow = typeof ticketTypes.$inferSelect;
export type PromoCodeRow = typeof eventPromoCodes.$inferSelect;

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** "คอนเสิร์ต Jazz Night 2026!" → "คอนเสิร์ต-jazz-night-2026" */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "event";
}

async function uniqueEventSlug(tx: Tx, tenantId: string, base: string, excludeId?: string | null): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 1000; i++) {
    const [hit] = await tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.slug, candidate)))
      .limit(1);
    if (!hit || (excludeId && hit.id === excludeId)) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** Remaining sellable tickets of a type (Infinity when unlimited). */
export function ticketTypeRemaining(t: Pick<TicketTypeRow, "quantity" | "sold" | "reserved">): number {
  if (t.quantity === null || t.quantity === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, t.quantity - t.sold - t.reserved);
}

/** Remaining seats of a session (Infinity when uncapped). */
export function sessionRemaining(s: Pick<SessionRow, "capacity" | "sold" | "reserved">): number {
  if (s.capacity === null || s.capacity === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, s.capacity - s.sold - s.reserved);
}

export type SaleState = "on_sale" | "not_started" | "closed" | "sold_out" | "hidden";

/**
 * Sale state of a ticket type at `now`. `closeAt` (session / event end) closes types without an explicit salesEnd.
 * A session with no seats left makes every type of it sold out.
 */
export function ticketTypeSaleState(t: TicketTypeRow, now: Date, ctx: { closeAt?: Date | null; sessionRemaining?: number } = {}): SaleState {
  if (t.visibility === "hidden") return "hidden";
  if (t.salesStart && t.salesStart.getTime() > now.getTime()) return "not_started";
  const closeAt = t.salesEnd ?? ctx.closeAt ?? null;
  if (closeAt && closeAt.getTime() <= now.getTime()) return "closed";
  if (ticketTypeRemaining(t) <= 0) return "sold_out";
  if (ctx.sessionRemaining !== undefined && ctx.sessionRemaining <= 0) return "sold_out";
  return "on_sale";
}

export interface TicketTypeView extends TicketTypeRow {
  /** Infinity = unlimited */
  remaining: number;
  saleState: SaleState;
}

export function viewTicketType(t: TicketTypeRow, now: Date, ctx: { closeAt?: Date | null; sessionRemaining?: number } = {}): TicketTypeView {
  return { ...t, remaining: ticketTypeRemaining(t), saleState: ticketTypeSaleState(t, now, ctx) };
}

/* ------------------------------------------------------------------ */
/* events – reads                                                       */
/* ------------------------------------------------------------------ */

export async function getEventById(tx: Tx, tenantId: string, id: string): Promise<EventRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(events).where(and(eq(events.tenantId, tenantId), eq(events.id, id))).limit(1);
  return row ?? null;
}

export async function getEventBySlug(tx: Tx, tenantId: string, slug: string): Promise<EventRow | null> {
  const [row] = await tx.select().from(events).where(and(eq(events.tenantId, tenantId), eq(events.slug, slug))).limit(1);
  return row ?? null;
}

export interface ListEventsFilter {
  status?: EventStatus | EventStatus[] | null;
  category?: string | null;
  featuredOnly?: boolean;
  /** title / summary / venue search */
  q?: string | null;
  /** upcoming = endsAt ≥ now (or no sessions yet) · past = endsAt < now */
  scope?: "upcoming" | "past" | "all";
  now?: Date;
  limit?: number;
  offset?: number;
  /** default: featured first, then startsAt asc (upcoming) / desc (past) */
  order?: "start_asc" | "start_desc" | "created_desc" | "sort";
}

function eventWhere(tenantId: string, f: ListEventsFilter) {
  const now = f.now ?? new Date();
  const where = [eq(events.tenantId, tenantId)];
  if (f.status) where.push(Array.isArray(f.status) ? inArray(events.status, f.status) : eq(events.status, f.status));
  if (f.category) where.push(eq(events.category, f.category));
  if (f.featuredOnly) where.push(eq(events.featured, true));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    where.push(or(ilike(events.title, like), ilike(events.summary, like), ilike(events.venueName, like), ilike(events.category, like))!);
  }
  if (f.scope === "upcoming") where.push(or(isNull(events.endsAt), gte(events.endsAt, now))!);
  if (f.scope === "past") where.push(lt(events.endsAt, now));
  return and(...where)!;
}

/** Admin / generic listing (any status). */
export async function listEvents(tx: Tx, tenantId: string, f: ListEventsFilter = {}): Promise<EventRow[]> {
  const order =
    f.order === "created_desc"
      ? [desc(events.createdAt)]
      : f.order === "sort"
        ? [asc(events.sort), asc(events.startsAt)]
        : f.order === "start_desc" || f.scope === "past"
          ? [desc(events.featured), desc(events.startsAt), desc(events.createdAt)]
          : [desc(events.featured), asc(events.sort), sql`${events.startsAt} asc nulls last`, desc(events.createdAt)];
  const q = tx.select().from(events).where(eventWhere(tenantId, f)).orderBy(...order);
  const limited = f.limit ? q.limit(f.limit) : q;
  return f.offset ? limited.offset(f.offset) : limited;
}

export async function countEvents(tx: Tx, tenantId: string, f: ListEventsFilter = {}): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(events).where(eventWhere(tenantId, f));
  return Number(row?.n ?? 0);
}

/** Storefront listing: published events only, upcoming by default. */
export async function listPublicEvents(tx: Tx, tenantId: string, f: Omit<ListEventsFilter, "status"> = {}): Promise<EventRow[]> {
  return listEvents(tx, tenantId, { scope: "upcoming", ...f, status: "published" });
}

/** Distinct categories of published events (for storefront filters). */
export async function listEventCategories(tx: Tx, tenantId: string, opts: { publishedOnly?: boolean } = {}): Promise<Array<{ category: string; count: number }>> {
  const where = [eq(events.tenantId, tenantId), sql`${events.category} is not null and ${events.category} <> ''`];
  if (opts.publishedOnly !== false) where.push(eq(events.status, "published"));
  const rows = await tx
    .select({ category: events.category, n: count() })
    .from(events)
    .where(and(...where))
    .groupBy(events.category)
    .orderBy(desc(count()), asc(events.category));
  return rows.map((r) => ({ category: r.category!, count: Number(r.n) }));
}

/* ------------------------------------------------------------------ */
/* sessions & ticket types – reads                                      */
/* ------------------------------------------------------------------ */

export async function listSessions(tx: Tx, tenantId: string, eventId: string, opts: { scheduledOnly?: boolean; upcomingOnly?: boolean; now?: Date } = {}): Promise<SessionRow[]> {
  const where = [eq(eventSessions.tenantId, tenantId), eq(eventSessions.eventId, eventId)];
  if (opts.scheduledOnly) where.push(eq(eventSessions.status, "scheduled"));
  if (opts.upcomingOnly) where.push(gt(eventSessions.endsAt, opts.now ?? new Date()));
  return tx
    .select()
    .from(eventSessions)
    .where(and(...where))
    .orderBy(asc(eventSessions.startsAt), asc(eventSessions.sort));
}

export async function getSessionById(tx: Tx, tenantId: string, id: string): Promise<SessionRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(eventSessions).where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.id, id))).limit(1);
  return row ?? null;
}

export async function listTicketTypes(tx: Tx, tenantId: string, eventId: string, opts: { sessionId?: string | null; publicOnly?: boolean } = {}): Promise<TicketTypeRow[]> {
  const where = [eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.eventId, eventId)];
  if (opts.sessionId) where.push(or(isNull(ticketTypes.sessionId), eq(ticketTypes.sessionId, opts.sessionId))!);
  if (opts.publicOnly) where.push(eq(ticketTypes.visibility, "public"));
  return tx
    .select()
    .from(ticketTypes)
    .where(and(...where))
    .orderBy(asc(ticketTypes.sort), asc(ticketTypes.price), asc(ticketTypes.createdAt));
}

export async function getTicketTypeById(tx: Tx, tenantId: string, id: string): Promise<TicketTypeRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.id, id))).limit(1);
  return row ?? null;
}

export interface SessionView extends SessionRow {
  remaining: number;
  /** true when the session has not ended and is scheduled */
  open: boolean;
  ticketTypes: TicketTypeView[];
  /** cheapest on-sale price (satang) or null */
  fromPrice: number | null;
  soldOut: boolean;
}

export interface EventDetail {
  event: EventRow;
  sessions: SessionView[];
  /** every ticket type of the event (incl. session-bound ones), with remaining/saleState */
  ticketTypes: TicketTypeView[];
  /** cheapest on-sale price across sessions (satang) or null */
  fromPrice: number | null;
  /** nothing can be bought right now (all sold out / closed / not started) */
  soldOut: boolean;
  /** at least one on-sale type */
  onSale: boolean;
}

function buildDetail(event: EventRow, sessions: SessionRow[], types: TicketTypeRow[], now: Date, publicOnly: boolean): EventDetail {
  const visibleTypes = publicOnly ? types.filter((t) => t.visibility === "public") : types;
  const sessionViews: SessionView[] = sessions.map((s) => {
    const remaining = sessionRemaining(s);
    const open = s.status === "scheduled" && s.endsAt.getTime() > now.getTime();
    const tts = visibleTypes
      .filter((t) => !t.sessionId || t.sessionId === s.id)
      .map((t) => {
        const v = viewTicketType(t, now, { closeAt: s.endsAt, sessionRemaining: remaining });
        return open ? v : { ...v, saleState: s.status === "cancelled" ? "closed" : v.saleState === "on_sale" ? "closed" : v.saleState };
      });
    const prices = tts.filter((t) => t.saleState === "on_sale").map((t) => t.price);
    // sold out = nothing on sale AND the reason is seats (capacity reached or every sellable type gone), not a closed / future sales window
    const anyOnSale = prices.length > 0;
    const soldOut = open && !anyOnSale && (remaining <= 0 || tts.some((t) => t.saleState === "sold_out"));
    return { ...s, remaining, open, ticketTypes: tts, fromPrice: anyOnSale ? Math.min(...prices) : null, soldOut };
  });
  const closeAt = event.endsAt ?? null;
  const eventTypes = visibleTypes.map((t) => {
    const s = t.sessionId ? sessionViews.find((x) => x.id === t.sessionId) : null;
    return s ? s.ticketTypes.find((x) => x.id === t.id)! : viewTicketType(t, now, { closeAt });
  });
  const onSalePrices = sessionViews.length ? sessionViews.flatMap((s) => s.ticketTypes.filter((t) => t.saleState === "on_sale").map((t) => t.price)) : eventTypes.filter((t) => t.saleState === "on_sale").map((t) => t.price);
  const anyOnSale = onSalePrices.length > 0;
  const anySoldOut = sessionViews.length ? sessionViews.some((s) => s.soldOut) : eventTypes.some((t) => t.saleState === "sold_out");
  return { event, sessions: sessionViews, ticketTypes: eventTypes, fromPrice: anyOnSale ? Math.min(...onSalePrices) : null, soldOut: !anyOnSale && anySoldOut, onSale: anyOnSale };
}

/** Event + sessions + ticket types with remaining counts. `publicOnly` hides hidden ticket types (storefront). */
export async function getEventDetail(tx: Tx, tenantId: string, eventId: string, opts: { now?: Date; publicOnly?: boolean } = {}): Promise<EventDetail | null> {
  const event = await getEventById(tx, tenantId, eventId);
  if (!event) return null;
  const now = opts.now ?? new Date();
  const [sessions, types] = await Promise.all([listSessions(tx, tenantId, event.id), listTicketTypes(tx, tenantId, event.id)]);
  return buildDetail(event, sessions, types, now, opts.publicOnly !== false);
}

/** Storefront event page: published event by slug (null for drafts). Cancelled / ended events are returned (page shows the state). */
export async function getPublicEvent(tx: Tx, tenantId: string, slug: string, opts: { now?: Date } = {}): Promise<EventDetail | null> {
  const event = await getEventBySlug(tx, tenantId, slug);
  if (!event || event.status === "draft") return null;
  const now = opts.now ?? new Date();
  const [sessions, types] = await Promise.all([listSessions(tx, tenantId, event.id), listTicketTypes(tx, tenantId, event.id)]);
  return buildDetail(event, sessions, types, now, true);
}

/** Cheapest on-sale price + sold-out flag for a list of events (event cards). */
export async function eventCardStats(tx: Tx, tenantId: string, eventIds: string[], opts: { now?: Date } = {}): Promise<Map<string, { fromPrice: number | null; soldOut: boolean; onSale: boolean; nextSession: SessionRow | null }>> {
  const out = new Map<string, { fromPrice: number | null; soldOut: boolean; onSale: boolean; nextSession: SessionRow | null }>();
  if (!eventIds.length) return out;
  const now = opts.now ?? new Date();
  const [sessions, types, evs] = await Promise.all([
    tx.select().from(eventSessions).where(and(eq(eventSessions.tenantId, tenantId), inArray(eventSessions.eventId, eventIds))).orderBy(asc(eventSessions.startsAt)),
    tx.select().from(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), inArray(ticketTypes.eventId, eventIds), eq(ticketTypes.visibility, "public"))),
    tx.select().from(events).where(and(eq(events.tenantId, tenantId), inArray(events.id, eventIds))),
  ]);
  for (const ev of evs) {
    const d = buildDetail(
      ev,
      sessions.filter((s) => s.eventId === ev.id),
      types.filter((t) => t.eventId === ev.id),
      now,
      true,
    );
    const nextSession = d.sessions.find((s) => s.open) ?? d.sessions[0] ?? null;
    out.set(ev.id, { fromPrice: d.fromPrice, soldOut: d.soldOut, onSale: d.onSale, nextSession });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* events – writes (admin)                                              */
/* ------------------------------------------------------------------ */

/** Recomputes events.starts_at / ends_at from the non-cancelled sessions. Call after any session write. */
export async function syncEventTimes(tx: Tx, tenantId: string, eventId: string): Promise<void> {
  const [agg] = await tx
    .select({ min: sql<Date | null>`min(${eventSessions.startsAt})`, max: sql<Date | null>`max(${eventSessions.endsAt})` })
    .from(eventSessions)
    .where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.eventId, eventId), eq(eventSessions.status, "scheduled")));
  const toDate = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
  await tx
    .update(events)
    .set({ startsAt: toDate(agg?.min), endsAt: toDate(agg?.max) })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, eventId)));
}

function eventValues(input: ReturnType<typeof eventInputSchema.parse>) {
  return {
    title: input.title,
    summary: input.summary?.trim() || null,
    description: input.description ? sanitizeHtml(input.description) : null,
    cover: input.cover?.trim() || null,
    gallery: input.gallery.filter(Boolean),
    category: input.category?.trim() || null,
    venueName: input.venueName?.trim() || null,
    venueAddress: input.venueAddress?.trim() || null,
    venueMapUrl: input.venueMapUrl?.trim() || null,
    organizer: input.organizer?.trim() || null,
    status: input.status,
    featured: input.featured,
    sort: input.sort,
    settings: input.settings,
  };
}

export async function createEvent(tx: Tx, tenantId: string, raw: EventInput): Promise<EventRow> {
  const input = eventInputSchema.parse(raw);
  const slug = await uniqueEventSlug(tx, tenantId, input.slug ?? slugify(input.title));
  const [row] = await tx
    .insert(events)
    .values({ tenantId, slug, ...eventValues(input) })
    .returning();
  return row!;
}

export async function updateEvent(tx: Tx, tenantId: string, id: string, raw: Partial<EventInput>): Promise<EventRow | null> {
  const current = await getEventById(tx, tenantId, id);
  if (!current) return null;
  const merged = eventInputSchema.parse({
    title: current.title,
    slug: current.slug,
    summary: current.summary,
    description: current.description,
    cover: current.cover,
    gallery: current.gallery,
    category: current.category,
    venueName: current.venueName,
    venueAddress: current.venueAddress,
    venueMapUrl: current.venueMapUrl,
    organizer: current.organizer,
    status: current.status,
    featured: current.featured,
    sort: current.sort,
    settings: current.settings,
    ...raw,
  });
  const slug = merged.slug && merged.slug !== current.slug ? await uniqueEventSlug(tx, tenantId, merged.slug, id) : current.slug;
  // description: only re-sanitize when the caller sent a new one (sanitizer is idempotent anyway)
  const values = eventValues(merged);
  if (raw.description === undefined) values.description = current.description;
  const [row] = await tx
    .update(events)
    .set({ ...values, slug })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, id)))
    .returning();
  return row ?? null;
}

export async function setEventStatus(tx: Tx, tenantId: string, id: string, status: EventStatus): Promise<EventRow | null> {
  const [row] = await tx
    .update(events)
    .set({ status })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, id)))
    .returning();
  return row ?? null;
}

/** Deletes an event that has no orders (orders reference it with ON DELETE RESTRICT). Returns false when orders exist. */
export async function deleteEvent(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [o] = await tx.select({ n: count() }).from(ticketOrders).where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.eventId, id)));
  if (Number(o?.n ?? 0) > 0) return false;
  const rows = await tx.delete(events).where(and(eq(events.tenantId, tenantId), eq(events.id, id))).returning({ id: events.id });
  return rows.length > 0;
}

export async function createSession(tx: Tx, tenantId: string, eventId: string, raw: SessionInput): Promise<SessionRow> {
  const input = sessionInputSchema.parse(raw);
  const [row] = await tx
    .insert(eventSessions)
    .values({ tenantId, eventId, name: input.name?.trim() || null, startsAt: input.startsAt, endsAt: input.endsAt, doorsOpen: input.doorsOpen ?? null, capacity: input.capacity ?? null, status: input.status, sort: input.sort })
    .returning();
  await syncEventTimes(tx, tenantId, eventId);
  return row!;
}

export async function updateSession(tx: Tx, tenantId: string, id: string, raw: Partial<SessionInput>): Promise<SessionRow | null> {
  const current = await getSessionById(tx, tenantId, id);
  if (!current) return null;
  const input = sessionInputSchema.parse({ name: current.name, startsAt: current.startsAt, endsAt: current.endsAt, doorsOpen: current.doorsOpen, capacity: current.capacity, status: current.status, sort: current.sort, ...raw });
  const [row] = await tx
    .update(eventSessions)
    .set({ name: input.name?.trim() || null, startsAt: input.startsAt, endsAt: input.endsAt, doorsOpen: input.doorsOpen ?? null, capacity: input.capacity ?? null, status: input.status, sort: input.sort })
    .where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.id, id)))
    .returning();
  await syncEventTimes(tx, tenantId, current.eventId);
  return row ?? null;
}

/** Deletes a session nobody has bought into (sold + reserved = 0); otherwise returns false (cancel it instead). */
export async function deleteSession(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const current = await getSessionById(tx, tenantId, id);
  if (!current) return false;
  if (current.sold > 0 || current.reserved > 0) return false;
  await tx.delete(eventSessions).where(and(eq(eventSessions.tenantId, tenantId), eq(eventSessions.id, id)));
  await syncEventTimes(tx, tenantId, current.eventId);
  return true;
}

export async function createTicketType(tx: Tx, tenantId: string, eventId: string, raw: TicketTypeInput): Promise<TicketTypeRow> {
  const input = ticketTypeInputSchema.parse(raw);
  const [row] = await tx
    .insert(ticketTypes)
    .values({
      tenantId,
      eventId,
      sessionId: input.sessionId ?? null,
      name: input.name,
      description: input.description?.trim() || null,
      price: input.price,
      quantity: input.quantity ?? null,
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      salesStart: input.salesStart ?? null,
      salesEnd: input.salesEnd ?? null,
      visibility: input.visibility,
      sort: input.sort,
    })
    .returning();
  return row!;
}

export async function updateTicketType(tx: Tx, tenantId: string, id: string, raw: Partial<TicketTypeInput>): Promise<TicketTypeRow | null> {
  const current = await getTicketTypeById(tx, tenantId, id);
  if (!current) return null;
  const input = ticketTypeInputSchema.parse({
    sessionId: current.sessionId,
    name: current.name,
    description: current.description,
    price: current.price,
    quantity: current.quantity,
    minPerOrder: current.minPerOrder,
    maxPerOrder: current.maxPerOrder,
    salesStart: current.salesStart,
    salesEnd: current.salesEnd,
    visibility: current.visibility,
    sort: current.sort,
    ...raw,
  });
  const [row] = await tx
    .update(ticketTypes)
    .set({
      sessionId: input.sessionId ?? null,
      name: input.name,
      description: input.description?.trim() || null,
      price: input.price,
      quantity: input.quantity ?? null,
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      salesStart: input.salesStart ?? null,
      salesEnd: input.salesEnd ?? null,
      visibility: input.visibility,
      sort: input.sort,
    })
    .where(and(eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.id, id)))
    .returning();
  return row ?? null;
}

/** Deletes a ticket type nothing was sold / reserved from; otherwise returns false (hide it instead). */
export async function deleteTicketType(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const current = await getTicketTypeById(tx, tenantId, id);
  if (!current || current.sold > 0 || current.reserved > 0) return false;
  await tx.delete(ticketTypes).where(and(eq(ticketTypes.tenantId, tenantId), eq(ticketTypes.id, id)));
  return true;
}

/* ------------------------------------------------------------------ */
/* promo codes                                                          */
/* ------------------------------------------------------------------ */

export async function listPromoCodes(tx: Tx, tenantId: string, opts: { eventId?: string | null } = {}): Promise<PromoCodeRow[]> {
  const where = [eq(eventPromoCodes.tenantId, tenantId)];
  if (opts.eventId) where.push(or(isNull(eventPromoCodes.eventId), eq(eventPromoCodes.eventId, opts.eventId))!);
  return tx
    .select()
    .from(eventPromoCodes)
    .where(and(...where))
    .orderBy(desc(eventPromoCodes.createdAt));
}

export async function findPromoCode(tx: Tx, tenantId: string, code: string): Promise<PromoCodeRow | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const [row] = await tx.select().from(eventPromoCodes).where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.code, c))).limit(1);
  return row ?? null;
}

export type PromoCheck = { ok: true; promo: PromoCodeRow; discount: number } | { ok: false; reason: "not_found" | "inactive" | "not_started" | "expired" | "used_up" | "wrong_event" };

/** Validates a promo code for an event at `now` and computes the discount (satang) on `subtotal`. */
export async function checkPromoCode(tx: Tx, tenantId: string, code: string, ctx: { eventId: string; subtotal: number; now?: Date }): Promise<PromoCheck> {
  const promo = await findPromoCode(tx, tenantId, code);
  if (!promo) return { ok: false, reason: "not_found" };
  const now = ctx.now ?? new Date();
  if (!promo.active) return { ok: false, reason: "inactive" };
  if (promo.eventId && promo.eventId !== ctx.eventId) return { ok: false, reason: "wrong_event" };
  if (promo.startsAt && promo.startsAt.getTime() > now.getTime()) return { ok: false, reason: "not_started" };
  if (promo.endsAt && promo.endsAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (promo.maxUses !== null && promo.used >= promo.maxUses) return { ok: false, reason: "used_up" };
  const discount = promo.kind === "percent" ? Math.floor((ctx.subtotal * Math.min(100, promo.value)) / 100) : Math.min(promo.value, ctx.subtotal);
  return { ok: true, promo, discount: Math.max(0, discount) };
}

export async function createPromoCode(tx: Tx, tenantId: string, raw: PromoCodeInput): Promise<PromoCodeRow> {
  const input = promoCodeInputSchema.parse(raw);
  const [row] = await tx
    .insert(eventPromoCodes)
    .values({ tenantId, eventId: input.eventId ?? null, code: input.code, kind: input.kind, value: input.value, maxUses: input.maxUses ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, active: input.active })
    .returning();
  return row!;
}

export async function updatePromoCode(tx: Tx, tenantId: string, id: string, raw: Partial<PromoCodeInput>): Promise<PromoCodeRow | null> {
  if (!isUuid(id)) return null;
  const [current] = await tx.select().from(eventPromoCodes).where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.id, id))).limit(1);
  if (!current) return null;
  const input = promoCodeInputSchema.parse({ eventId: current.eventId, code: current.code, kind: current.kind, value: current.value, maxUses: current.maxUses, startsAt: current.startsAt, endsAt: current.endsAt, active: current.active, ...raw });
  const [row] = await tx
    .update(eventPromoCodes)
    .set({ eventId: input.eventId ?? null, code: input.code, kind: input.kind, value: input.value, maxUses: input.maxUses ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, active: input.active })
    .where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.id, id)))
    .returning();
  return row ?? null;
}

export async function deletePromoCode(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await tx.delete(eventPromoCodes).where(and(eq(eventPromoCodes.tenantId, tenantId), eq(eventPromoCodes.id, id))).returning({ id: eventPromoCodes.id });
  return rows.length > 0;
}

export { sanitizeHtml, stripHtml };
