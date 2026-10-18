/** Back-office reads for the events module: list aggregates, KPIs, filter options. Server only. */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { eventSessions, events, ticketOrders, tickets, ticketTypes, type Tx } from "@rentweb/db";
import type { EventRow, SessionRow } from "../services/catalog";
import { bkkDayBounds, bkkParts, bkkDateTime } from "../services/time";
import { ORDER_TABS, type EventScope, type OrderTab } from "./labels";

export interface Actor {
  userId: string;
  actorType: "user" | "superadmin";
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/* ------------------------------- events list ------------------------------- */

export interface EventAdminRow {
  event: EventRow;
  /** scheduled sessions */
  sessions: number;
  nextSession: SessionRow | null;
  /** live tickets (valid + checked_in) */
  ticketsSold: number;
  checkedIn: number;
  /** satang: Σ paid − refunded over paid / refunded orders */
  revenue: number;
  pendingOrders: number;
  /** Σ ticket-type quantities; null when any type is unlimited */
  capacity: number | null;
}

function scopeWhere(scope: EventScope, now: Date): SQL | undefined {
  switch (scope) {
    case "upcoming":
      return and(eq(events.status, "published"), or(isNull(events.endsAt), gte(events.endsAt, now)));
    case "draft":
      return eq(events.status, "draft");
    case "past":
      return or(inArray(events.status, ["ended", "cancelled"]), and(eq(events.status, "published"), lt(events.endsAt, now)));
    default:
      return undefined;
  }
}

export async function listEventsAdmin(tx: Tx, tenantId: string, f: { scope?: EventScope; q?: string | null; page?: number; perPage?: number; now?: Date } = {}): Promise<{ rows: EventAdminRow[]; total: number; page: number; pages: number }> {
  const now = f.now ?? new Date();
  const scope = f.scope ?? "upcoming";
  const page = Math.max(1, f.page ?? 1);
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 24));
  const where: SQL[] = [eq(events.tenantId, tenantId)];
  const sw = scopeWhere(scope, now);
  if (sw) where.push(sw);
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    where.push(or(ilike(events.title, like), ilike(events.slug, like), ilike(events.venueName, like), ilike(events.category, like), ilike(events.organizer, like))!);
  }
  const order = scope === "upcoming" ? [sql`${events.startsAt} asc nulls last`, asc(events.sort), desc(events.createdAt)] : scope === "past" ? [sql`${events.endsAt} desc nulls last`, desc(events.createdAt)] : scope === "draft" ? [desc(events.updatedAt)] : [desc(events.createdAt)];
  const [[tot], list] = await Promise.all([
    tx.select({ c: count() }).from(events).where(and(...where)),
    tx
      .select()
      .from(events)
      .where(and(...where))
      .orderBy(...order)
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);
  const total = n(tot?.c);
  const ids = list.map((e) => e.id);
  const agg = await eventAggregates(tx, tenantId, ids, now);
  return {
    rows: list.map((event) => ({ event, ...(agg.get(event.id) ?? EMPTY_AGG) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

type Agg = Omit<EventAdminRow, "event">;
const EMPTY_AGG: Agg = { sessions: 0, nextSession: null, ticketsSold: 0, checkedIn: 0, revenue: 0, pendingOrders: 0, capacity: 0 };

async function eventAggregates(tx: Tx, tenantId: string, ids: string[], now: Date): Promise<Map<string, Agg>> {
  const map = new Map<string, Agg>();
  if (!ids.length) return map;
  for (const id of ids) map.set(id, { ...EMPTY_AGG });
  const [sess, next, tix, ords, caps] = await Promise.all([
    tx
      .select({ eventId: eventSessions.eventId, c: count() })
      .from(eventSessions)
      .where(and(eq(eventSessions.tenantId, tenantId), inArray(eventSessions.eventId, ids), eq(eventSessions.status, "scheduled")))
      .groupBy(eventSessions.eventId),
    tx
      .select()
      .from(eventSessions)
      .where(and(eq(eventSessions.tenantId, tenantId), inArray(eventSessions.eventId, ids), eq(eventSessions.status, "scheduled"), gte(eventSessions.endsAt, now)))
      .orderBy(asc(eventSessions.startsAt)),
    tx
      .select({ eventId: tickets.eventId, live: sql<string>`count(*) filter (where ${tickets.status} in ('valid','checked_in'))`, checkedIn: sql<string>`count(*) filter (where ${tickets.status} = 'checked_in')` })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), inArray(tickets.eventId, ids)))
      .groupBy(tickets.eventId),
    tx
      .select({ eventId: ticketOrders.eventId, revenue: sql<string>`coalesce(sum(case when ${ticketOrders.status} in ('paid','refunded') then ${ticketOrders.paidAmount} - ${ticketOrders.refundedAmount} else 0 end), 0)`, pending: sql<string>`count(*) filter (where ${ticketOrders.status} = 'pending')` })
      .from(ticketOrders)
      .where(and(eq(ticketOrders.tenantId, tenantId), inArray(ticketOrders.eventId, ids)))
      .groupBy(ticketOrders.eventId),
    tx
      .select({ eventId: ticketTypes.eventId, qty: sql<string>`coalesce(sum(${ticketTypes.quantity}), 0)`, unlimited: sql<boolean>`bool_or(${ticketTypes.quantity} is null)` })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.tenantId, tenantId), inArray(ticketTypes.eventId, ids)))
      .groupBy(ticketTypes.eventId),
  ]);
  for (const s of sess) map.get(s.eventId)!.sessions = n(s.c);
  for (const s of next) {
    const a = map.get(s.eventId)!;
    if (!a.nextSession) a.nextSession = s;
  }
  for (const t of tix) {
    const a = map.get(t.eventId)!;
    a.ticketsSold = n(t.live);
    a.checkedIn = n(t.checkedIn);
  }
  for (const o of ords) {
    const a = map.get(o.eventId)!;
    a.revenue = n(o.revenue);
    a.pendingOrders = n(o.pending);
  }
  for (const c of caps) map.get(c.eventId)!.capacity = c.unlimited ? null : n(c.qty);
  return map;
}

export async function eventScopeCounts(tx: Tx, tenantId: string, now: Date = new Date()): Promise<Record<EventScope, number>> {
  const [r] = await tx
    .select({
      upcoming: sql<string>`count(*) filter (where ${events.status} = 'published' and (${events.endsAt} is null or ${events.endsAt} >= ${ts(now)}))`,
      draft: sql<string>`count(*) filter (where ${events.status} = 'draft')`,
      past: sql<string>`count(*) filter (where ${events.status} in ('ended','cancelled') or (${events.status} = 'published' and ${events.endsAt} < ${ts(now)}))`,
      all: count(),
    })
    .from(events)
    .where(eq(events.tenantId, tenantId));
  return { upcoming: n(r?.upcoming), draft: n(r?.draft), past: n(r?.past), all: n(r?.all) };
}

/* ----------------------------------- KPIs ---------------------------------- */

export interface EventsKpis {
  /** live tickets of events that have not ended */
  ticketsUpcoming: number;
  /** live tickets, all time */
  ticketsAllTime: number;
  /** satang, paid this Bangkok month (paid − refunded) */
  revenueMonth: number;
  /** satang, all time */
  revenueAllTime: number;
  checkInsToday: number;
  pendingOrders: number;
  upcomingEvents: number;
}

export async function eventsKpis(tx: Tx, tenantId: string, now: Date = new Date()): Promise<EventsKpis> {
  const { start, end } = bkkDayBounds(now);
  const p = bkkParts(now);
  const monthStart = bkkDateTime(`${p.y}-${String(p.m).padStart(2, "0")}-01`);
  const [[t], [o], [e]] = await Promise.all([
    tx
      .select({
        upcoming: sql<string>`count(*) filter (where ${tickets.status} in ('valid','checked_in') and (${events.endsAt} is null or ${events.endsAt} >= ${ts(now)}))`,
        all: sql<string>`count(*) filter (where ${tickets.status} in ('valid','checked_in'))`,
        today: sql<string>`count(*) filter (where ${tickets.status} = 'checked_in' and ${tickets.checkedInAt} >= ${ts(start)} and ${tickets.checkedInAt} < ${ts(end)})`,
      })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.tenantId, tenantId)),
    tx
      .select({
        month: sql<string>`coalesce(sum(case when ${ticketOrders.status} in ('paid','refunded') and ${ticketOrders.paidAt} >= ${ts(monthStart)} then ${ticketOrders.paidAmount} - ${ticketOrders.refundedAmount} else 0 end), 0)`,
        all: sql<string>`coalesce(sum(case when ${ticketOrders.status} in ('paid','refunded') then ${ticketOrders.paidAmount} - ${ticketOrders.refundedAmount} else 0 end), 0)`,
        pending: sql<string>`count(*) filter (where ${ticketOrders.status} = 'pending')`,
      })
      .from(ticketOrders)
      .where(eq(ticketOrders.tenantId, tenantId)),
    tx
      .select({ c: count() })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.status, "published"), or(isNull(events.endsAt), gte(events.endsAt, now)))),
  ]);
  return { ticketsUpcoming: n(t?.upcoming), ticketsAllTime: n(t?.all), revenueMonth: n(o?.month), revenueAllTime: n(o?.all), checkInsToday: n(t?.today), pendingOrders: n(o?.pending), upcomingEvents: n(e?.c) };
}

/** Per-event numbers for the detail header and the cancel / refund warning. */
export async function eventLiveSummary(tx: Tx, tenantId: string, eventId: string): Promise<{ paidOrders: number; pendingOrders: number; liveTickets: number; checkedIn: number; revenue: number; refunded: number }> {
  const [[o], [t]] = await Promise.all([
    tx
      .select({
        paid: sql<string>`count(*) filter (where ${ticketOrders.status} = 'paid')`,
        pending: sql<string>`count(*) filter (where ${ticketOrders.status} = 'pending')`,
        revenue: sql<string>`coalesce(sum(case when ${ticketOrders.status} in ('paid','refunded') then ${ticketOrders.paidAmount} - ${ticketOrders.refundedAmount} else 0 end), 0)`,
        refunded: sql<string>`coalesce(sum(${ticketOrders.refundedAmount}), 0)`,
      })
      .from(ticketOrders)
      .where(and(eq(ticketOrders.tenantId, tenantId), eq(ticketOrders.eventId, eventId))),
    tx
      .select({ live: sql<string>`count(*) filter (where ${tickets.status} in ('valid','checked_in'))`, checkedIn: sql<string>`count(*) filter (where ${tickets.status} = 'checked_in')` })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.eventId, eventId))),
  ]);
  return { paidOrders: n(o?.paid), pendingOrders: n(o?.pending), liveTickets: n(t?.live), checkedIn: n(t?.checkedIn), revenue: n(o?.revenue), refunded: n(o?.refunded) };
}

/* ---------------------------------- orders --------------------------------- */

export async function orderTabCounts(tx: Tx, tenantId: string, eventId?: string | null): Promise<Record<OrderTab, number>> {
  const where = [eq(ticketOrders.tenantId, tenantId)];
  if (eventId) where.push(eq(ticketOrders.eventId, eventId));
  const rows = await tx
    .select({ status: ticketOrders.status, c: count() })
    .from(ticketOrders)
    .where(and(...where))
    .groupBy(ticketOrders.status);
  const by = new Map(rows.map((r) => [r.status, n(r.c)]));
  const out = {} as Record<OrderTab, number>;
  for (const t of ORDER_TABS) out[t.key] = t.statuses ? t.statuses.reduce((s, st) => s + (by.get(st) ?? 0), 0) : rows.reduce((s, r) => s + n(r.c), 0);
  return out;
}

export function orderTabStatuses(tab: OrderTab): string[] | null {
  return ORDER_TABS.find((t) => t.key === tab)?.statuses ?? null;
}

/* ------------------------------ filter options ----------------------------- */

export interface EventOption {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Events for filter dropdowns (orders / attendees): newest first, upcoming on top. */
export async function listEventOptions(tx: Tx, tenantId: string, opts: { limit?: number; now?: Date } = {}): Promise<EventOption[]> {
  const now = opts.now ?? new Date();
  const rows = await tx
    .select({ id: events.id, title: events.title, status: events.status, startsAt: events.startsAt, endsAt: events.endsAt })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), inArray(events.status, ["published", "draft", "ended", "cancelled"])))
    .orderBy(sql`case when ${events.status} = 'published' and (${events.endsAt} is null or ${events.endsAt} >= ${ts(now)}) then 0 else 1 end`, sql`${events.startsAt} asc nulls last`, desc(events.createdAt))
    .limit(Math.min(500, opts.limit ?? 200));
  return rows;
}

export interface GateEvent {
  event: EventOption;
  sessions: Array<Pick<SessionRow, "id" | "name" | "startsAt" | "endsAt" | "doorsOpen" | "status">>;
}

/** Published events that can still be checked in (sessions ending today or later), today's sessions first. */
export async function listGateEvents(tx: Tx, tenantId: string, now: Date = new Date()): Promise<GateEvent[]> {
  const { start } = bkkDayBounds(now);
  const evs = await tx
    .select({ id: events.id, title: events.title, status: events.status, startsAt: events.startsAt, endsAt: events.endsAt })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.status, "published"), or(isNull(events.endsAt), gte(events.endsAt, start))))
    .orderBy(sql`${events.startsAt} asc nulls last`);
  if (!evs.length) return [];
  const sess = await tx
    .select({ id: eventSessions.id, eventId: eventSessions.eventId, name: eventSessions.name, startsAt: eventSessions.startsAt, endsAt: eventSessions.endsAt, doorsOpen: eventSessions.doorsOpen, status: eventSessions.status })
    .from(eventSessions)
    .where(and(eq(eventSessions.tenantId, tenantId), inArray(eventSessions.eventId, evs.map((e) => e.id)), eq(eventSessions.status, "scheduled"), gte(eventSessions.endsAt, start)))
    .orderBy(asc(eventSessions.startsAt));
  return evs.map((event) => ({ event, sessions: sess.filter((s) => s.eventId === event.id) }));
}
