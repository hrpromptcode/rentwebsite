import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";
import { customers } from "./customers";

/**
 * Events module: events → sessions (dated occurrences) → ticket types → ticket orders → tickets (one per attendee).
 * Instants are stored as timestamptz; "day" logic (check-in day, listings) is evaluated in Asia/Bangkok by the module.
 * Money is integer satang. Counters: `reserved` = held by pending unpaid orders, `sold` = paid; remaining = quantity − sold − reserved.
 */

export const events = pgTable(
  "events",
  {
    id: id(),
    tenantId: tenantRef(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    /** sanitized HTML (module sanitizer) */
    description: text("description"),
    cover: text("cover"),
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    category: text("category"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    venueMapUrl: text("venue_map_url"),
    organizer: text("organizer"),
    /** draft | published | cancelled | ended */
    status: text("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    /** denormalised: earliest / latest non-cancelled session (kept by syncEventTimes) */
    startsAt: tz("starts_at"),
    endsAt: tz("ends_at"),
    /** free-form settings (ticket terms override, limits…) */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("events_tenant_slug_uq").on(t.tenantId, t.slug),
    index("events_tenant_status_starts_idx").on(t.tenantId, t.status, t.startsAt),
    index("events_tenant_category_idx").on(t.tenantId, t.category),
  ],
);

export const eventSessions = pgTable(
  "event_sessions",
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** optional label: "รอบบ่าย", "วันที่ 2" */
    name: text("name"),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    doorsOpen: tz("doors_open"),
    /** null = unlimited (ticket-type quantities still apply) */
    capacity: integer("capacity"),
    reserved: integer("reserved").notNull().default(0),
    sold: integer("sold").notNull().default(0),
    /** scheduled | cancelled | ended */
    status: text("status").notNull().default("scheduled"),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("event_sessions_event_idx").on(t.tenantId, t.eventId, t.startsAt),
    index("event_sessions_tenant_status_starts_idx").on(t.tenantId, t.status, t.startsAt),
  ],
);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** null = valid for any session of the event (the buyer picks the session on the order) */
    sessionId: uuid("session_id").references(() => eventSessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** satang; 0 = free */
    price: money("price").notNull().default(0),
    /** null = unlimited */
    quantity: integer("quantity"),
    reserved: integer("reserved").notNull().default(0),
    sold: integer("sold").notNull().default(0),
    minPerOrder: integer("min_per_order").notNull().default(1),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    salesStart: tz("sales_start"),
    salesEnd: tz("sales_end"),
    /** public | hidden (hidden = direct link / admin only) */
    visibility: text("visibility").notNull().default("public"),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("ticket_types_event_idx").on(t.tenantId, t.eventId, t.sort), index("ticket_types_session_idx").on(t.tenantId, t.sessionId)],
);

export const eventPromoCodes = pgTable(
  "event_promo_codes",
  {
    id: id(),
    tenantId: tenantRef(),
    /** null = every event of the tenant */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** stored upper-case */
    code: text("code").notNull(),
    /** percent | amount */
    kind: text("kind").notNull().default("percent"),
    /** percent (1-100) or satang */
    value: integer("value").notNull().default(0),
    maxUses: integer("max_uses"),
    used: integer("used").notNull().default(0),
    startsAt: tz("starts_at"),
    endsAt: tz("ends_at"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("event_promo_codes_tenant_code_uq").on(t.tenantId, t.code)],
);

export interface TicketOrderLine {
  ticketTypeId: string;
  name: string;
  /** satang each */
  unitPrice: number;
  qty: number;
  total: number;
}

export interface TicketHolderInput {
  ticketTypeId: string;
  name: string;
  email?: string | null;
}

export interface TicketOrderMeta {
  /** attendee names given at checkout (one entry per ticket, in line order); missing = contact name */
  holders?: TicketHolderInput[];
  /** payment method chosen at checkout */
  paymentMethod?: string | null;
  promo?: { code: string; kind: string; value: number } | null;
  [k: string]: unknown;
}

export const ticketOrders = pgTable(
  "ticket_orders",
  {
    id: id(),
    tenantId: tenantRef(),
    number: text("number").notNull(), // TK-1001
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").references(() => eventSessions.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    lines: jsonb("lines").$type<TicketOrderLine[]>().notNull().default([]),
    /** total number of tickets in the order */
    quantity: integer("quantity").notNull().default(0),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    total: money("total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    refundedAmount: money("refunded_amount").notNull().default(0),
    /** pending | paid | cancelled | refunded | expired */
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("online"),
    promoCode: text("promo_code"),
    /** the order's current payment (null for free orders) */
    paymentId: uuid("payment_id"),
    accessKey: text("access_key").notNull(),
    note: text("note"),
    internalNote: text("internal_note"),
    metadata: jsonb("metadata").$type<TicketOrderMeta>().notNull().default({}),
    /** pending orders stop holding tickets after this instant (payment expiry + grace) */
    holdUntil: tz("hold_until"),
    paidAt: tz("paid_at"),
    cancelledAt: tz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    cancelledBy: text("cancelled_by"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("ticket_orders_tenant_number_uq").on(t.tenantId, t.number),
    index("ticket_orders_event_status_idx").on(t.tenantId, t.eventId, t.status, t.createdAt),
    index("ticket_orders_customer_idx").on(t.tenantId, t.customerId, t.createdAt),
    index("ticket_orders_status_hold_idx").on(t.tenantId, t.status, t.holdUntil),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    tenantId: tenantRef(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => eventSessions.id, { onDelete: "set null" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    /** human-enterable secure code (XXXX-XXXX-XXXX), unique per tenant; the QR carries an HMAC-signed payload around it */
    code: text("code").notNull(),
    holderName: text("holder_name").notNull(),
    holderEmail: text("holder_email"),
    seatLabel: text("seat_label"),
    /** satang paid for this ticket (line unit price after proportional discount) – used for per-ticket refunds */
    price: money("price").notNull().default(0),
    /** valid | checked_in | void | refunded */
    status: text("status").notNull().default("valid"),
    checkedInAt: tz("checked_in_at"),
    /** admin user id or device label */
    checkedInBy: text("checked_in_by"),
    voidReason: text("void_reason"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("tickets_tenant_code_uq").on(t.tenantId, t.code),
    index("tickets_order_idx").on(t.tenantId, t.orderId),
    index("tickets_event_session_status_idx").on(t.tenantId, t.eventId, t.sessionId, t.status),
    index("tickets_type_idx").on(t.tenantId, t.ticketTypeId),
  ],
);
